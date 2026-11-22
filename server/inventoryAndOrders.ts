import crypto from 'crypto';
import type {
  AdminProduct,
  BundleQuantity,
  CustomerRecord,
  Order,
  OrderCustomerInput,
  OrderItemLine,
  OrderPricingSummary,
  OrderSource,
  OrderStatus,
  ProductSize,
  StockMovement,
} from '../src/types/store';
import {
  cartSummaryToOrderPricing,
  computeCartTotals,
} from '../src/utils/cartAndPromoLogic';
import {
  calculateOrderTotals,
  isProductPubliclyActive,
  normalizeSerbianPhoneDigits,
  validateCustomerForm,
} from '../src/utils/storeLogic';
import { syncProductStockFields } from './db';
import type { FullStoreDatabase } from './types';

export class DomainError extends Error {
  statusCode: number;
  validationErrors?: Record<string, string>;

  constructor(
    statusCode: number,
    message: string,
    validationErrors?: Record<string, string>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.validationErrors = validationErrors;
  }
}

export function generatePublicOrderCode(existingOrders: Order[]): string {
  const existing = new Set(existingOrders.map((o) => o.id));
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  for (let i = 0; i < 20; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const code = `AO-${yy}${mm}-${rand}`;
    if (!existing.has(code)) return code;
  }
  return `AO-${yy}${mm}-${Date.now().toString().slice(-5)}`;
}

function appendMovement(
  db: FullStoreDatabase,
  movement: Omit<StockMovement, 'id' | 'createdAt'>,
) {
  db.stockMovements.unshift({
    id: `mov-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    createdAt: new Date().toISOString(),
    ...movement,
  });
  if (db.stockMovements.length > 2000) {
    db.stockMovements.length = 2000;
  }
}

function upsertCustomerForOrder(
  db: FullStoreDatabase,
  customerInput: OrderCustomerInput,
  orderTotal: number,
  isDeliveredInitial: boolean,
): CustomerRecord {
  const normPhone = normalizeSerbianPhoneDigits(customerInput.phone);
  const nowIso = new Date().toISOString();
  const existing = db.customers.find((c) => c.normalizedPhone === normPhone);
  if (existing) {
    existing.fullName = customerInput.fullName.trim();
    existing.street = customerInput.street.trim();
    existing.cityZip = customerInput.cityZip.trim();
    if (customerInput.email) existing.email = customerInput.email.trim();
    existing.ordersCount += 1;
    if (isDeliveredInitial) existing.deliveredCount += 1;
    existing.totalSpentRsd += orderTotal;
    existing.lastOrderAt = nowIso;
    return existing;
  }

  const created: CustomerRecord = {
    id: `cust-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    fullName: customerInput.fullName.trim(),
    phone: customerInput.phone.trim(),
    normalizedPhone: normPhone,
    email: customerInput.email?.trim() || undefined,
    street: customerInput.street.trim(),
    cityZip: customerInput.cityZip.trim(),
    ordersCount: 1,
    deliveredCount: isDeliveredInitial ? 1 : 0,
    uncollectedCount: 0,
    returnedCount: 0,
    totalSpentRsd: orderTotal,
    lastOrderAt: nowIso,
    createdAt: nowIso,
  };
  db.customers.unshift(created);
  return created;
}

export interface PlaceOrderInput {
  // Single-item 1-step format (backwards compatible)
  productId?: string;
  selectedSize?: ProductSize;
  bundleQuantity?: BundleQuantity;
  // Multi-item cart / manual order format
  items?: {
    productId: string;
    size: ProductSize;
    color?: string;
    quantity: number;
    customUnitPrice?: number;
  }[];
  customer: OrderCustomerInput;
  couponCode?: string;
  giftWrap?: boolean;
  pickupInPerson?: boolean;
  idempotencyKey?: string;
  source?: OrderSource;
  initialStatus?: OrderStatus;
  shippingOverrideRsd?: number;
  internalNote?: string;
}

export function createOrderInDb(
  db: FullStoreDatabase,
  input: PlaceOrderInput,
  actor = 'kupac',
  isAdminManual = false,
): { order: Order; updatedProducts: AdminProduct[]; idempotentReplay: boolean } {
  const idemKey = input.idempotencyKey?.trim();
  if (idemKey && db.idempotencyMap[idemKey]) {
    const existingOrderId = db.idempotencyMap[idemKey];
    const existingOrder = db.orders.find((o) => o.id === existingOrderId);
    if (existingOrder) {
      const affectedIds = new Set(
        existingOrder.items?.map((i) => i.productId) ?? [existingOrder.productId],
      );
      return {
        order: existingOrder,
        updatedProducts: db.products.filter((p) => affectedIds.has(p.id)),
        idempotentReplay: true,
      };
    }
  }

  const validationErrors = validateCustomerForm(input.customer, {
    pickupInPerson: input.pickupInPerson,
  });
  if (Object.keys(validationErrors).length > 0) {
    throw new DomainError(
      400,
      Object.values(validationErrors)[0] || 'Neispravni podaci kupca.',
      validationErrors as Record<string, string>,
    );
  }

  // Normalize requested line items
  const requestedLines =
    input.items && input.items.length > 0
      ? input.items
      : input.productId && input.selectedSize
        ? [
            {
              productId: input.productId,
              size: input.selectedSize,
              quantity:
                input.bundleQuantity === 2 || input.bundleQuantity === 3
                  ? input.bundleQuantity
                  : 1,
            },
          ]
        : [];

  if (requestedLines.length === 0) {
    throw new DomainError(400, 'Korpa ili izbor artikla je prazan.');
  }

  // Merge duplicate product+size+color lines so stock check sums correctly
  const mergedLinesMap = new Map<
    string,
    { productId: string; size: ProductSize; color?: string; quantity: number; customUnitPrice?: number }
  >();
  for (const line of requestedLines) {
    const qty = Math.floor(Number(line.quantity) || 0);
    if (qty <= 0) {
      throw new DomainError(400, 'Količina mora biti najmanje 1 komad.');
    }
    const key = `${line.productId}::${line.size}::${line.color || ''}`;
    const prev = mergedLinesMap.get(key);
    if (prev) {
      prev.quantity += qty;
    } else {
      mergedLinesMap.set(key, {
        productId: line.productId,
        size: line.size,
        color: line.color,
        quantity: qty,
        customUnitPrice: isAdminManual ? line.customUnitPrice : undefined,
      });
    }
  }
  const normalizedLines = Array.from(mergedLinesMap.values());

  // Atomic check across ALL lines before deducting any stock
  const resolvedProductMap = new Map<string, AdminProduct>();
  for (const line of normalizedLines) {
    const prod = db.products.find((p) => p.id === line.productId);
    if (!prod) {
      throw new DomainError(404, 'Izabrani artikal nije pronađen u ponudi.');
    }
    if (!isAdminManual && !isProductPubliclyActive(prod)) {
      throw new DomainError(409, `Artikal „${prod.title}“ trenutno nije dostupan.`);
    }

    const synced = syncProductStockFields(prod);
    const matchingVariant = synced.variants?.find(
      (v) => v.size === line.size && (!line.color || v.color === line.color),
    );
    const available = matchingVariant
      ? Math.max(0, matchingVariant.physicalStock - matchingVariant.reservedStock)
      : Math.max(0, synced.stockBySize[line.size] ?? 0);

    if (available <= 0) {
      throw new DomainError(
        409,
        `Veličina ${line.size} za „${prod.title}“ je upravo rasprodata.`,
      );
    }
    if (available < line.quantity) {
      throw new DomainError(
        409,
        `Za artikal „${prod.title}“ (${line.size}) raspoloživo je samo ${available} komada na stanju.`,
      );
    }
    resolvedProductMap.set(prod.id, synced);
  }

  // Coupon lookup
  const couponInput = input.couponCode?.trim().toUpperCase();
  const matchedCoupon = couponInput
    ? db.coupons.find((c) => c.code.toUpperCase() === couponInput) ?? null
    : null;

  let pricing: OrderPricingSummary;
  let appliedPromoName: string | undefined;
  let appliedCouponCode: string | undefined;

  // Single-product bundle calculation vs multi-item cart calculation
  if (
    !isAdminManual &&
    normalizedLines.length === 1 &&
    !couponInput &&
    !input.giftWrap &&
    !input.pickupInPerson &&
    (normalizedLines[0].quantity === 1 ||
      normalizedLines[0].quantity === 2 ||
      normalizedLines[0].quantity === 3)
  ) {
    const singleProd = resolvedProductMap.get(normalizedLines[0].productId)!;
    pricing = calculateOrderTotals(
      singleProd.salePrice,
      normalizedLines[0].quantity as BundleQuantity,
      db.settings,
    );
  } else {
    const tempProducts: AdminProduct[] = Array.from(resolvedProductMap.values()).map((p) => {
      const overrideLine = normalizedLines.find(
        (l) => l.productId === p.id && l.customUnitPrice && l.customUnitPrice > 0,
      );
      return overrideLine?.customUnitPrice
        ? { ...p, salePrice: Math.round(overrideLine.customUnitPrice) }
        : p;
    });
    const cartSummary = computeCartTotals({
      cartItems: normalizedLines.map((l) => ({
        productId: l.productId,
        size: l.size,
        color: l.color,
        quantity: l.quantity,
      })),
      products: tempProducts,
      settings: db.settings,
      promotions: db.promotions,
      coupon: matchedCoupon,
      couponInputCode: couponInput,
      pickupInPerson: input.pickupInPerson,
      giftWrap: input.giftWrap,
    });
    if (cartSummary.couponError) {
      throw new DomainError(400, cartSummary.couponError);
    }
    pricing = cartSummaryToOrderPricing(cartSummary);
    appliedPromoName = cartSummary.appliedPromoName;
    appliedCouponCode = cartSummary.appliedCouponCode;
  }

  if (
    isAdminManual &&
    typeof input.shippingOverrideRsd === 'number' &&
    input.shippingOverrideRsd >= 0
  ) {
    const shippingCost = Math.round(input.shippingOverrideRsd);
    pricing = {
      ...pricing,
      shippingCost,
      isFreeShipping: shippingCost === 0,
      total: pricing.subtotal + (pricing.giftWrapCost ?? 0) + shippingCost,
    };
  }

  // Deduct stock atomically and build order items
  const orderCode = generatePublicOrderCode(db.orders);
  const nowIso = new Date().toISOString();
  const orderItems: OrderItemLine[] = [];
  const updatedProductIds = new Set<string>();

  for (const line of normalizedLines) {
    const idx = db.products.findIndex((p) => p.id === line.productId);
    const current = syncProductStockFields(db.products[idx]);
    const variantIdx = (current.variants ?? []).findIndex(
      (v) => v.size === line.size && (!line.color || v.color === line.color),
    );
    const variant = variantIdx >= 0 ? current.variants![variantIdx] : undefined;
    if (variant) {
      variant.physicalStock = Math.max(0, variant.physicalStock - line.quantity);
      variant.soldCount += line.quantity;
    } else {
      current.stockBySize[line.size] = Math.max(
        0,
        (current.stockBySize[line.size] ?? 0) - line.quantity,
      );
    }
    const resynced = syncProductStockFields({
      ...current,
      soldCount: (current.soldCount ?? 0) + line.quantity,
      updatedAt: nowIso,
    });
    db.products[idx] = resynced;
    updatedProductIds.add(resynced.id);

    const updatedVar = resynced.variants?.find(
      (v) => v.size === line.size && (!line.color || v.color === line.color),
    );

    const unitSalePrice =
      isAdminManual && line.customUnitPrice && line.customUnitPrice > 0
        ? Math.round(line.customUnitPrice)
        : resynced.salePrice;

    orderItems.push({
      productId: resynced.id,
      variantId: updatedVar?.id,
      sku: updatedVar?.sku || resynced.sku,
      title: resynced.title,
      imageUrl: resynced.imageUrl,
      size: line.size,
      color: line.color || updatedVar?.color || resynced.color,
      quantity: line.quantity,
      unitSalePrice,
      unitOriginalPrice: resynced.originalPrice,
      unitPurchasePrice: resynced.purchasePrice ?? null,
      returnedQty: 0,
      damagedReturnedQty: 0,
    });

    appendMovement(db, {
      productId: resynced.id,
      productTitle: resynced.title,
      variantId: updatedVar?.id,
      sku: updatedVar?.sku || resynced.sku,
      size: line.size,
      color: line.color || resynced.color,
      type: 'Prodaja',
      delta: -line.quantity,
      physicalAfter: updatedVar?.physicalStock ?? (resynced.stockBySize[line.size] ?? 0),
      reservedAfter: updatedVar?.reservedStock ?? 0,
      reason: `Porudžbina ${orderCode} (${input.source || 'Internet prodavnica'})`,
      orderId: orderCode,
      actor,
    });
  }

  if (matchedCoupon && appliedCouponCode) {
    matchedCoupon.usedCount += 1;
  }

  const initialStatus: OrderStatus =
    isAdminManual && input.initialStatus ? input.initialStatus : 'Nova';

  const customerRecord = upsertCustomerForOrder(
    db,
    input.customer,
    pricing.total,
    initialStatus === 'Isporučena',
  );

  const firstLine = orderItems[0];
  const trackingToken = crypto.randomBytes(12).toString('hex');

  const newOrder: Order = {
    id: orderCode,
    internalId: `ord-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    idempotencyKey: idemKey || undefined,
    trackingToken,
    source: input.source || 'Internet prodavnica',
    customerId: customerRecord.id,
    productId: firstLine.productId,
    productTitle:
      orderItems.length > 1
        ? `${firstLine.title} (+ još ${orderItems.length - 1})`
        : firstLine.title,
    productImage: firstLine.imageUrl,
    selectedSize: firstLine.size,
    bundleQuantity: orderItems.reduce((s, i) => s + i.quantity, 0),
    items: orderItems,
    couponCode: appliedCouponCode,
    appliedPromoName,
    giftWrap: Boolean(input.giftWrap),
    pickupInPerson: Boolean(input.pickupInPerson),
    customer: {
      fullName: input.customer.fullName.trim(),
      street: input.pickupInPerson
        ? db.settings.pickupAddress || 'Lično preuzimanje u butiku'
        : input.customer.street.trim(),
      cityZip: input.pickupInPerson ? 'Lično preuzimanje' : input.customer.cityZip.trim(),
      phone: input.customer.phone.trim(),
      email: input.customer.email?.trim() || undefined,
      note: input.customer.note?.trim() || undefined,
    },
    pricing,
    status: initialStatus,
    statusHistory: [{ status: initialStatus, at: nowIso, actor }],
    stockState: 'deducted',
    shipping: {
      courier: input.pickupInPerson ? 'Lično preuzimanje' : 'Post Express',
      chargedToCustomer: pricing.shippingCost,
      actualCost: input.pickupInPerson ? 0 : db.settings.shippingCostRsd,
      returnCost: 0,
      shippedAt: initialStatus === 'Poslata' ? nowIso : undefined,
      deliveredAt: initialStatus === 'Isporučena' ? nowIso : undefined,
    },
    cod: {
      expectedAmount: pricing.total,
      collectedFromCustomer: initialStatus === 'Isporučena',
      settledToSeller: Boolean(input.pickupInPerson && initialStatus === 'Isporučena'),
      courierFee: 0,
      receivedAmount:
        input.pickupInPerson && initialStatus === 'Isporučena' ? pricing.total : 0,
    },
    returns: [],
    internalNote: input.internalNote?.trim() || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.orders.unshift(newOrder);
  if (idemKey) {
    db.idempotencyMap[idemKey] = newOrder.id;
  }

  return {
    order: newOrder,
    updatedProducts: db.products.filter((p) => updatedProductIds.has(p.id)),
    idempotentReplay: false,
  };
}

export function transitionOrderStatusInDb(
  db: FullStoreDatabase,
  orderId: string,
  nextStatus: OrderStatus,
  options: {
    trackingNumber?: string;
    actualShippingCost?: number;
    returnCost?: number;
    note?: string;
    actor: string;
  },
): { order: Order; updatedProducts: AdminProduct[] } {
  const orderIdx = db.orders.findIndex((o) => o.id === orderId);
  if (orderIdx === -1) {
    throw new DomainError(404, 'Porudžbina nije pronađena.');
  }

  const order = db.orders[orderIdx];
  const nowIso = new Date().toISOString();
  const updatedProductIds = new Set<string>();

  const releaseStatuses = new Set<OrderStatus>(['Otkazano', 'Vraćena']);

  // Single-time automatic stock release on cancellation or full return
  if (releaseStatuses.has(nextStatus) && order.stockState === 'deducted') {
    const lines = order.items ?? [];
    for (const line of lines) {
      const restockableQty = Math.max(0, line.quantity - (line.returnedQty ?? 0));
      if (restockableQty === 0) continue;

      const pIdx = db.products.findIndex((p) => p.id === line.productId);
      if (pIdx === -1) continue;
      const prod = syncProductStockFields(db.products[pIdx]);
      const vIdx = (prod.variants ?? []).findIndex(
        (v) => v.size === line.size && (!line.color || v.color === line.color),
      );
      const variant = vIdx >= 0 ? prod.variants![vIdx] : undefined;

      if (variant) {
        variant.physicalStock += restockableQty;
        if (nextStatus === 'Vraćena') {
          variant.returnedCount += restockableQty;
        }
        variant.soldCount = Math.max(0, variant.soldCount - restockableQty);
      } else {
        prod.stockBySize[line.size] = (prod.stockBySize[line.size] ?? 0) + restockableQty;
      }

      const resynced = syncProductStockFields({
        ...prod,
        soldCount: Math.max(0, (prod.soldCount ?? 0) - restockableQty),
        updatedAt: nowIso,
      });
      db.products[pIdx] = resynced;
      updatedProductIds.add(resynced.id);

      const updatedVar = resynced.variants?.find(
        (v) => v.size === line.size && (!line.color || v.color === line.color),
      );

      appendMovement(db, {
        productId: resynced.id,
        productTitle: resynced.title,
        variantId: updatedVar?.id,
        sku: updatedVar?.sku || resynced.sku,
        size: line.size,
        color: line.color || resynced.color,
        type: nextStatus === 'Otkazano' ? 'Otkazivanje' : 'Povraćaj',
        delta: restockableQty,
        physicalAfter: updatedVar?.physicalStock ?? (resynced.stockBySize[line.size] ?? 0),
        reservedAfter: updatedVar?.reservedStock ?? 0,
        reason: `${nextStatus} za porudžbinu ${order.id}`,
        orderId: order.id,
        actor: options.actor,
      });
    }
    order.stockState = 'released';
  }

  // Update CRM customer reliability stats
  if (order.customerId) {
    const cust = db.customers.find((c) => c.id === order.customerId);
    if (cust) {
      if (nextStatus === 'Isporučena' && order.status !== 'Isporučena') {
        cust.deliveredCount += 1;
      }
      if (
        (nextStatus === 'Neuspešna dostava' || nextStatus === 'Vraćena') &&
        order.status !== 'Neuspešna dostava' &&
        order.status !== 'Vraćena'
      ) {
        cust.uncollectedCount += 1;
        if (nextStatus === 'Vraćena') cust.returnedCount += 1;
      }
    }
  }

  order.status = nextStatus;
  order.updatedAt = nowIso;
  order.statusHistory = [
    ...(order.statusHistory ?? []),
    {
      status: nextStatus,
      at: nowIso,
      actor: options.actor,
      note: options.note,
    },
  ];

  order.shipping = {
    courier: order.shipping?.courier ?? 'Post Express',
    chargedToCustomer: order.shipping?.chargedToCustomer ?? order.pricing.shippingCost,
    actualCost:
      typeof options.actualShippingCost === 'number'
        ? Math.round(options.actualShippingCost)
        : (order.shipping?.actualCost ?? 450),
    returnCost:
      typeof options.returnCost === 'number'
        ? Math.round(options.returnCost)
        : (order.shipping?.returnCost ?? 0),
    trackingNumber: options.trackingNumber?.trim() || order.shipping?.trackingNumber,
    shippedAt:
      nextStatus === 'Poslata' && !order.shipping?.shippedAt
        ? nowIso
        : order.shipping?.shippedAt,
    deliveredAt:
      nextStatus === 'Isporučena' && !order.shipping?.deliveredAt
        ? nowIso
        : order.shipping?.deliveredAt,
  };

  if (nextStatus === 'Isporučena') {
    order.cod = {
      expectedAmount: order.cod?.expectedAmount ?? order.pricing.total,
      collectedFromCustomer: true,
      settledToSeller: order.cod?.settledToSeller ?? false,
      settledAt: order.cod?.settledAt,
      courierFee: order.cod?.courierFee ?? 0,
      receivedAmount: order.cod?.receivedAmount ?? 0,
      discrepancyNote: order.cod?.discrepancyNote,
    };
  }

  db.orders[orderIdx] = order;
  return {
    order,
    updatedProducts: db.products.filter((p) => updatedProductIds.has(p.id)),
  };
}

export function processOrderReturnInDb(
  db: FullStoreDatabase,
  orderId: string,
  payload: {
    reason: string;
    refundAmountRsd: number;
    returnShippingCostRsd: number;
    items: {
      productId: string;
      size: ProductSize;
      color?: string;
      returnedQty: number;
      damagedQty: number;
    }[];
  },
  actor: string,
): { order: Order; updatedProducts: AdminProduct[] } {
  const orderIdx = db.orders.findIndex((o) => o.id === orderId);
  if (orderIdx === -1) {
    throw new DomainError(404, 'Porudžbina nije pronađena.');
  }

  const order = db.orders[orderIdx];
  const nowIso = new Date().toISOString();
  const updatedProductIds = new Set<string>();

  for (const retLine of payload.items) {
    const goodQty = Math.max(0, Math.floor(retLine.returnedQty || 0));
    const damagedQty = Math.max(0, Math.floor(retLine.damagedQty || 0));
    const totalReturnedHere = goodQty + damagedQty;
    if (totalReturnedHere === 0) continue;

    const orderLine = order.items?.find(
      (i) => i.productId === retLine.productId && i.size === retLine.size,
    );
    if (!orderLine) {
      throw new DomainError(400, `Artikal (${retLine.size}) ne postoji na porudžbini.`);
    }

    const alreadyReturned = orderLine.returnedQty ?? 0;
    if (alreadyReturned + totalReturnedHere > orderLine.quantity) {
      throw new DomainError(
        400,
        `Nije moguće vratiti više komada nego što je poručeno za „${orderLine.title}“.`,
      );
    }

    orderLine.returnedQty = alreadyReturned + totalReturnedHere;
    orderLine.damagedReturnedQty = (orderLine.damagedReturnedQty ?? 0) + damagedQty;

    const pIdx = db.products.findIndex((p) => p.id === retLine.productId);
    if (pIdx === -1) continue;

    const prod = syncProductStockFields(db.products[pIdx]);
    const vIdx = (prod.variants ?? []).findIndex(
      (v) => v.size === retLine.size && (!retLine.color || v.color === retLine.color),
    );
    const variant = vIdx >= 0 ? prod.variants![vIdx] : undefined;

    if (variant) {
      // ONLY undamaged goods go back to saleable physicalStock!
      if (goodQty > 0) {
        variant.physicalStock += goodQty;
        variant.returnedCount += goodQty;
      }
      if (damagedQty > 0) {
        variant.damagedCount += damagedQty;
      }
    } else if (goodQty > 0) {
      prod.stockBySize[retLine.size] = (prod.stockBySize[retLine.size] ?? 0) + goodQty;
    }

    const resynced = syncProductStockFields({
      ...prod,
      updatedAt: nowIso,
    });
    db.products[pIdx] = resynced;
    updatedProductIds.add(resynced.id);

    const updatedVar = resynced.variants?.find(
      (v) => v.size === retLine.size && (!retLine.color || v.color === retLine.color),
    );

    if (goodQty > 0) {
      appendMovement(db, {
        productId: resynced.id,
        productTitle: resynced.title,
        variantId: updatedVar?.id,
        sku: updatedVar?.sku || resynced.sku,
        size: retLine.size,
        color: retLine.color || resynced.color,
        type: 'Povraćaj',
        delta: goodQty,
        physicalAfter: updatedVar?.physicalStock ?? (resynced.stockBySize[retLine.size] ?? 0),
        reservedAfter: updatedVar?.reservedStock ?? 0,
        reason: `Povraćaj ispravne robe (${order.id}): ${payload.reason}`,
        orderId: order.id,
        actor,
      });
    }
    if (damagedQty > 0) {
      appendMovement(db, {
        productId: resynced.id,
        productTitle: resynced.title,
        variantId: updatedVar?.id,
        sku: updatedVar?.sku || resynced.sku,
        size: retLine.size,
        color: retLine.color || resynced.color,
        type: 'Oštećenje',
        delta: 0,
        physicalAfter: updatedVar?.physicalStock ?? (resynced.stockBySize[retLine.size] ?? 0),
        reservedAfter: updatedVar?.reservedStock ?? 0,
        reason: `Oštećen povraćaj (${damagedQty} kom, NIJE vraćen u prodaju · ${order.id}): ${payload.reason}`,
        orderId: order.id,
        actor,
      });
    }
  }

  order.returns = [
    ...(order.returns ?? []),
    {
      id: `ret-${Date.now().toString(36)}`,
      orderId: order.id,
      reason: payload.reason.trim() || 'Povraćaj kupca',
      items: payload.items,
      refundAmountRsd: Math.max(0, Math.round(payload.refundAmountRsd || 0)),
      returnShippingCostRsd: Math.max(0, Math.round(payload.returnShippingCostRsd || 0)),
      actor,
      createdAt: nowIso,
    },
  ];

  // If every item on the order was returned, mark order Vraćena and stockState released
  const totalOrdered = (order.items ?? []).reduce((s, i) => s + i.quantity, 0);
  const totalReturned = (order.items ?? []).reduce((s, i) => s + (i.returnedQty ?? 0), 0);
  if (totalOrdered > 0 && totalReturned >= totalOrdered) {
    order.status = 'Vraćena';
    order.stockState = 'released';
  }
  order.updatedAt = nowIso;
  order.statusHistory = [
    ...(order.statusHistory ?? []),
    {
      status: order.status,
      at: nowIso,
      actor,
      note: `Evidentiran povraćaj (${payload.reason})`,
    },
  ];

  if (order.customerId) {
    const cust = db.customers.find((c) => c.id === order.customerId);
    if (cust) cust.returnedCount += 1;
  }

  db.orders[orderIdx] = order;
  return {
    order,
    updatedProducts: db.products.filter((p) => updatedProductIds.has(p.id)),
  };
}

export function reconcileInventoryInDb(
  db: FullStoreDatabase,
  productId: string,
  adjustments: { size: ProductSize; color?: string; newPhysicalStock: number }[],
  reason: string,
  actor: string,
): AdminProduct {
  const pIdx = db.products.findIndex((p) => p.id === productId);
  if (pIdx === -1) {
    throw new DomainError(404, 'Artikal nije pronađen.');
  }

  const prod = syncProductStockFields(db.products[pIdx]);
  const nowIso = new Date().toISOString();

  for (const adj of adjustments) {
    const targetQty = Math.max(0, Math.floor(adj.newPhysicalStock));
    const vIdx = (prod.variants ?? []).findIndex(
      (v) => v.size === adj.size && (!adj.color || v.color === adj.color),
    );
    if (vIdx >= 0) {
      const v = prod.variants![vIdx];
      const delta = targetQty - v.physicalStock;
      if (delta !== 0) {
        v.physicalStock = targetQty;
        appendMovement(db, {
          productId: prod.id,
          productTitle: prod.title,
          variantId: v.id,
          sku: v.sku,
          size: adj.size,
          color: v.color,
          type: 'Ručna korekcija',
          delta,
          physicalAfter: targetQty,
          reservedAfter: v.reservedStock,
          reason: reason.trim() || 'Inventura / ručna korekcija stanja',
          actor,
        });
      }
    } else {
      const prevQty = prod.stockBySize[adj.size] ?? 0;
      const delta = targetQty - prevQty;
      prod.stockBySize[adj.size] = targetQty;
      prod.variants?.push({
        id: `${prod.id}-${adj.size}`,
        sku: `${prod.sku || prod.id}-${adj.size}`,
        color: adj.color || prod.color || 'Osnovna',
        size: adj.size,
        physicalStock: targetQty,
        reservedStock: 0,
        soldCount: 0,
        returnedCount: 0,
        damagedCount: 0,
      });
      if (delta !== 0) {
        appendMovement(db, {
          productId: prod.id,
          productTitle: prod.title,
          size: adj.size,
          color: adj.color || prod.color,
          type: 'Ručna korekcija',
          delta,
          physicalAfter: targetQty,
          reservedAfter: 0,
          reason: reason.trim() || 'Inventura / ručna korekcija stanja',
          actor,
        });
      }
    }
  }

  const resynced = syncProductStockFields({
    ...prod,
    updatedAt: nowIso,
  });
  db.products[pIdx] = resynced;
  return resynced;
}

export function settleCodOrdersInDb(
  db: FullStoreDatabase,
  settlements: {
    orderId: string;
    receivedAmount?: number;
    courierFee?: number;
    discrepancyNote?: string;
  }[],
  actor: string,
): Order[] {
  const nowIso = new Date().toISOString();
  const updated: Order[] = [];

  for (const s of settlements) {
    const order = db.orders.find((o) => o.id === s.orderId);
    if (!order) continue;
    if (order.status !== 'Isporučena') {
      throw new DomainError(
        400,
        `Porudžbina ${order.id} mora imati status „Isporučena“ pre rasknjižavanja otkupa.`,
      );
    }

    const expected = order.cod?.expectedAmount ?? order.pricing.total;
    const fee = Math.max(0, Math.round(s.courierFee ?? 0));
    const received =
      typeof s.receivedAmount === 'number'
        ? Math.max(0, Math.round(s.receivedAmount))
        : Math.max(0, expected - fee);

    order.cod = {
      expectedAmount: expected,
      collectedFromCustomer: true,
      settledToSeller: true,
      settledAt: nowIso,
      courierFee: fee,
      receivedAmount: received,
      discrepancyNote: s.discrepancyNote?.trim() || undefined,
    };
    order.updatedAt = nowIso;
    order.statusHistory = [
      ...(order.statusHistory ?? []),
      {
        status: order.status,
        at: nowIso,
        actor,
        note: `Otkup rasknjižen (${received} RSD)`,
      },
    ];
    updated.push(order);
  }

  return updated;
}

export function mergeCustomersInDb(
  db: FullStoreDatabase,
  primaryCustomerId: string,
  duplicateCustomerId: string,
): CustomerRecord {
  if (primaryCustomerId === duplicateCustomerId) {
    throw new DomainError(400, 'Izaberite dva različita profila kupaca za spajanje.');
  }
  const primary = db.customers.find((c) => c.id === primaryCustomerId);
  const dupIdx = db.customers.findIndex((c) => c.id === duplicateCustomerId);
  if (!primary || dupIdx === -1) {
    throw new DomainError(404, 'Kupac nije pronađen.');
  }
  const dup = db.customers[dupIdx];

  primary.ordersCount += dup.ordersCount;
  primary.deliveredCount += dup.deliveredCount;
  primary.uncollectedCount += dup.uncollectedCount;
  primary.returnedCount += dup.returnedCount;
  primary.totalSpentRsd += dup.totalSpentRsd;
  if (dup.lastOrderAt > primary.lastOrderAt) {
    primary.lastOrderAt = dup.lastOrderAt;
  }
  if (dup.internalNote) {
    primary.internalNote = primary.internalNote
      ? `${primary.internalNote}\n${dup.internalNote}`
      : dup.internalNote;
  }

  // Re-point orders
  for (const o of db.orders) {
    if (o.customerId === dup.id) {
      o.customerId = primary.id;
    }
  }

  db.customers.splice(dupIdx, 1);
  return primary;
}
