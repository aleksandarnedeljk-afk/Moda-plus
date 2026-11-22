import { DEFAULT_STORE_SETTINGS } from '../config/storeConfig';
import type {
  CartItem,
  CouponCode,
  OrderPricingSummary,
  Product,
  PromotionRule,
  StoreSettings,
} from '../types/store';

export const CART_STORAGE_KEY = 'atelier_outlet_cart_v1';
export const RECENTLY_VIEWED_STORAGE_KEY = 'atelier_outlet_recently_viewed_v1';
export const CUSTOMER_PREFILL_STORAGE_KEY = 'atelier_outlet_saved_customer_v1';
export const CONSENT_STORAGE_KEY = 'atelier_outlet_consent_v1';

export interface CartSummary {
  lineCount: number;
  totalPieces: number;
  baseTotal: number;
  bundleDiscountPercent: number;
  bundleDiscountAmount: number;
  promoDiscountAmount: number;
  appliedPromoName?: string;
  couponDiscountAmount: number;
  appliedCouponCode?: string;
  couponError?: string;
  giftWrapCost: number;
  subtotalAfterDiscounts: number;
  shippingCost: number;
  isFreeShipping: boolean;
  freeShippingRemainingRsd: number;
  total: number;
}

export function isRuleActiveNow(
  rule: { active: boolean; startsAt?: string; endsAt?: string; expiresAt?: string },
  now: Date = new Date(),
): boolean {
  if (!rule.active) return false;
  const nowMs = now.getTime();
  if (rule.startsAt && new Date(rule.startsAt).getTime() > nowMs) return false;
  if (rule.endsAt && new Date(rule.endsAt).getTime() < nowMs) return false;
  if (rule.expiresAt && new Date(rule.expiresAt).getTime() < nowMs) return false;
  return true;
}

export function getVariantAvailableStock(
  product: Product,
  size: string,
  color?: string,
): number {
  if (product.variants && product.variants.length > 0) {
    return product.variants
      .filter((v) => v.size === size && (!color || v.color === color))
      .reduce((sum, v) => sum + Math.max(0, v.physicalStock - v.reservedStock), 0);
  }
  return Math.max(0, product.stockBySize[size] ?? 0);
}

export function computeCartTotals(params: {
  cartItems: CartItem[];
  products: Product[];
  settings?: Pick<
    StoreSettings,
    | 'shippingCostRsd'
    | 'freeShippingThresholdRsd'
    | 'bundle2DiscountPercent'
    | 'bundle3DiscountPercent'
    | 'giftWrapCostRsd'
  >;
  promotions?: PromotionRule[];
  coupon?: CouponCode | null;
  couponInputCode?: string;
  pickupInPerson?: boolean;
  giftWrap?: boolean;
  now?: Date;
}): CartSummary {
  const settings = params.settings ?? DEFAULT_STORE_SETTINGS;
  const now = params.now ?? new Date();
  const productMap = new Map(params.products.map((p) => [p.id, p]));

  let totalPieces = 0;
  let baseTotal = 0;
  let lineCount = 0;

  const resolvedLines: { product: Product; item: CartItem; lineBase: number }[] = [];

  for (const item of params.cartItems) {
    const product = productMap.get(item.productId);
    if (!product || item.quantity <= 0) continue;
    const qty = Math.floor(item.quantity);
    const lineBase = product.salePrice * qty;
    totalPieces += qty;
    baseTotal += lineBase;
    lineCount += 1;
    resolvedLines.push({ product, item, lineBase });
  }

  // Dynamic bundle discount on cart total pieces (2 pcs -> -15%, 3+ pcs -> -20%)
  const bundleDiscountPercent =
    totalPieces >= 3
      ? settings.bundle3DiscountPercent
      : totalPieces === 2
        ? settings.bundle2DiscountPercent
        : 0;
  const bundleDiscountAmount = Math.round(baseTotal * (bundleDiscountPercent / 100));
  let runningSubtotal = baseTotal - bundleDiscountAmount;

  // Automatic promotions (apply best eligible active promotion)
  let promoDiscountAmount = 0;
  let appliedPromoName: string | undefined;
  let promoForcesFreeShipping = false;

  for (const promo of params.promotions ?? []) {
    if (!isRuleActiveNow(promo, now)) continue;
    if (bundleDiscountAmount > 0 && !promo.stackWithBundle) continue;

    if (promo.type === 'free_shipping_threshold') {
      if (runningSubtotal >= (promo.minCartRsd ?? 0)) {
        promoForcesFreeShipping = true;
        if (!appliedPromoName) appliedPromoName = promo.name;
      }
      continue;
    }

    let candidateDiscount = 0;
    const pct = promo.discountPercent ?? 0;
    if (promo.type === 'cart_threshold_percent' && runningSubtotal >= (promo.minCartRsd ?? 0)) {
      candidateDiscount = Math.round(runningSubtotal * (pct / 100));
    } else if (promo.type === 'category_percent' && promo.targetCategory) {
      const catBase = resolvedLines
        .filter((l) => l.product.category === promo.targetCategory)
        .reduce((s, l) => s + l.lineBase, 0);
      const afterBundleRatio = baseTotal > 0 ? runningSubtotal / baseTotal : 1;
      candidateDiscount = Math.round(catBase * afterBundleRatio * (pct / 100));
    } else if (promo.type === 'last_piece_percent') {
      const lastPieceBase = resolvedLines
        .filter((l) => {
          const totalAvail = Object.values(l.product.stockBySize).reduce<number>(
            (s, n) => s + (n ?? 0),
            0,
          );
          return totalAvail === 1;
        })
        .reduce((s, l) => s + l.lineBase, 0);
      candidateDiscount = Math.round(lastPieceBase * (pct / 100));
    }

    if (candidateDiscount > promoDiscountAmount) {
      promoDiscountAmount = candidateDiscount;
      appliedPromoName = promo.name;
    }
  }

  runningSubtotal = Math.max(0, runningSubtotal - promoDiscountAmount);

  // Coupon validation & discount
  let couponDiscountAmount = 0;
  let appliedCouponCode: string | undefined;
  let couponError: string | undefined;

  if (params.couponInputCode && params.couponInputCode.trim()) {
    const c = params.coupon;
    if (!c) {
      couponError = 'Kupon kod nije pronađen.';
    } else if (!isRuleActiveNow(c, now)) {
      couponError = 'Kupon više nije aktivan ili je istekao.';
    } else if (c.maxUses && c.usedCount >= c.maxUses) {
      couponError = 'Kupon je dostigao maksimalan broj korišćenja.';
    } else if (runningSubtotal < c.minOrderRsd) {
      couponError = `Minimalan iznos za kupon je ${c.minOrderRsd} RSD.`;
    } else {
      couponDiscountAmount =
        c.discountType === 'percent'
          ? Math.round(runningSubtotal * (c.value / 100))
          : Math.min(runningSubtotal, Math.round(c.value));
      appliedCouponCode = c.code;
      runningSubtotal = Math.max(0, runningSubtotal - couponDiscountAmount);
    }
  }

  const giftWrapCost =
    params.giftWrap && lineCount > 0 ? Math.max(0, Math.round(settings.giftWrapCostRsd)) : 0;

  const isFreeShipping =
    lineCount === 0 ||
    Boolean(params.pickupInPerson) ||
    totalPieces >= 3 ||
    promoForcesFreeShipping ||
    runningSubtotal >= settings.freeShippingThresholdRsd;

  const shippingCost = lineCount === 0 || isFreeShipping ? 0 : settings.shippingCostRsd;
  const freeShippingRemainingRsd = isFreeShipping
    ? 0
    : Math.max(0, settings.freeShippingThresholdRsd - runningSubtotal);
  const total = runningSubtotal + giftWrapCost + shippingCost;

  return {
    lineCount,
    totalPieces,
    baseTotal,
    bundleDiscountPercent,
    bundleDiscountAmount,
    promoDiscountAmount,
    appliedPromoName,
    couponDiscountAmount,
    appliedCouponCode,
    couponError,
    giftWrapCost,
    subtotalAfterDiscounts: runningSubtotal,
    shippingCost,
    isFreeShipping,
    freeShippingRemainingRsd,
    total,
  };
}

export function cartSummaryToOrderPricing(summary: CartSummary): OrderPricingSummary {
  return {
    unitSalePrice:
      summary.totalPieces > 0 ? Math.round(summary.baseTotal / summary.totalPieces) : 0,
    quantity: summary.totalPieces,
    baseTotal: summary.baseTotal,
    discountPercent: summary.bundleDiscountPercent,
    discountAmount: summary.bundleDiscountAmount,
    promoDiscountAmount: summary.promoDiscountAmount,
    couponDiscountAmount: summary.couponDiscountAmount,
    giftWrapCost: summary.giftWrapCost,
    subtotal: summary.subtotalAfterDiscounts,
    shippingCost: summary.shippingCost,
    isFreeShipping: summary.isFreeShipping,
    total: summary.total,
  };
}

export function serializeCartShareParam(items: CartItem[]): string {
  return items
    .filter((i) => i.quantity > 0)
    .map((i) => `${encodeURIComponent(i.productId)}:${encodeURIComponent(i.size)}:${i.quantity}`)
    .join(',');
}

export function parseCartShareParam(raw: string | null): CartItem[] {
  if (!raw) return [];
  const items: CartItem[] = [];
  for (const part of raw.split(',')) {
    const [pid, sz, qtyStr] = part.split(':');
    const qty = Math.max(1, Math.min(20, Math.floor(Number(qtyStr) || 1)));
    if (pid && sz) {
      items.push({
        productId: decodeURIComponent(pid),
        size: decodeURIComponent(sz),
        quantity: qty,
      });
    }
  }
  return items;
}
