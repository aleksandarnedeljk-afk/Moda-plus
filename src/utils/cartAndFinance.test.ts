import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminProduct, CouponCode, Order, PromotionRule } from '../types/store';
import { computeCartTotals } from './cartAndPromoLogic';
import {
  applyClearanceRollbackToProducts,
  computeFinancialSummary,
  previewClearanceMarkdown,
} from './financeLogic';

function makeProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 'p-1',
    title: 'Haljina Test',
    category: 'Ženske haljine',
    description: 'Opis',
    materialNote: 'Pamuk',
    salePrice: 2000,
    originalPrice: 4000,
    purchasePrice: 900,
    minAllowedPrice: 1200,
    imageUrl: '/test.jpg',
    stockBySize: { S: 1, M: 3 },
    active: true,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

test('Cart totals apply 2-piece 15% bundle discount, 3-piece 20% + free shipping, coupon, and threshold correctly', () => {
  const p1 = makeProduct({ id: 'p-1', salePrice: 1500 });
  const p2 = makeProduct({ id: 'p-2', salePrice: 2000 });

  // 1 piece under 4000 -> 450 shipping
  const one = computeCartTotals({
    cartItems: [{ productId: 'p-1', size: 'M', quantity: 1 }],
    products: [p1, p2],
  });
  assert.equal(one.baseTotal, 1500);
  assert.equal(one.bundleDiscountPercent, 0);
  assert.equal(one.shippingCost, 450);
  assert.equal(one.total, 1950);

  // 2 pieces -> -15% bundle, still under 4000 after discount -> 450 shipping
  const two = computeCartTotals({
    cartItems: [
      { productId: 'p-1', size: 'M', quantity: 1 },
      { productId: 'p-2', size: 'M', quantity: 1 },
    ],
    products: [p1, p2],
  });
  assert.equal(two.baseTotal, 3500);
  assert.equal(two.bundleDiscountPercent, 15);
  assert.equal(two.subtotalAfterDiscounts, 2975);
  assert.equal(two.shippingCost, 450);

  // 3 pieces -> -20% + automatic free shipping
  const three = computeCartTotals({
    cartItems: [
      { productId: 'p-1', size: 'M', quantity: 2 },
      { productId: 'p-2', size: 'M', quantity: 1 },
    ],
    products: [p1, p2],
  });
  assert.equal(three.bundleDiscountPercent, 20);
  assert.equal(three.isFreeShipping, true);
  assert.equal(three.shippingCost, 0);

  // Coupon + non-stacking promo check
  const coupon: CouponCode = {
    id: 'cpn-1',
    code: 'VIP10',
    discountType: 'percent',
    value: 10,
    minOrderRsd: 1000,
    usedCount: 0,
    active: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
  const promo: PromotionRule = {
    id: 'prm-1',
    name: 'Vikend 10%',
    type: 'cart_threshold_percent',
    minCartRsd: 1000,
    discountPercent: 10,
    stackWithBundle: false,
    active: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const withCoupon = computeCartTotals({
    cartItems: [{ productId: 'p-1', size: 'M', quantity: 1 }],
    products: [p1],
    promotions: [promo],
    coupon,
    couponInputCode: 'VIP10',
  });
  assert.equal(withCoupon.promoDiscountAmount, 150);
  assert.equal(withCoupon.couponDiscountAmount, 135);
  assert.equal(withCoupon.subtotalAfterDiscounts, 1215);
});

test('Financial summary tracks realized COGS strictly from known purchasePrice and separates COD awaiting vs settled', () => {
  const prodKnown = makeProduct({ id: 'p-known', purchasePrice: 800, salePrice: 2000 });
  const prodUnknown = makeProduct({ id: 'p-unknown', purchasePrice: null, salePrice: 1500 });

  const deliveredAwaiting: Order = {
    id: 'AO-1',
    productId: 'p-known',
    productTitle: 'Haljina',
    productImage: '/x.jpg',
    selectedSize: 'M',
    bundleQuantity: 1,
    items: [
      {
        productId: 'p-known',
        title: 'Haljina',
        imageUrl: '/x.jpg',
        size: 'M',
        quantity: 2,
        unitSalePrice: 2000,
        unitOriginalPrice: 4000,
        unitPurchasePrice: 800,
      },
    ],
    customer: { fullName: 'Ana Anić', street: 'Kralja Petra 1', cityZip: 'Beograd 11000', phone: '0641112233' },
    pricing: {
      unitSalePrice: 2000,
      quantity: 2,
      baseTotal: 4000,
      discountPercent: 0,
      discountAmount: 0,
      subtotal: 4000,
      shippingCost: 0,
      isFreeShipping: true,
      total: 4000,
    },
    status: 'Isporučena',
    cod: {
      expectedAmount: 4000,
      collectedFromCustomer: true,
      settledToSeller: false,
      courierFee: 0,
      receivedAmount: 0,
    },
    createdAt: '2026-11-10T10:00:00.000Z',
  };

  const deliveredUnknownCost: Order = {
    ...deliveredAwaiting,
    id: 'AO-2',
    productId: 'p-unknown',
    items: [
      {
        productId: 'p-unknown',
        title: 'Nepoznata nabavka',
        imageUrl: '/x.jpg',
        size: 'S',
        quantity: 1,
        unitSalePrice: 1500,
        unitOriginalPrice: 3000,
        unitPurchasePrice: null,
      },
    ],
    pricing: {
      unitSalePrice: 1500,
      quantity: 1,
      baseTotal: 1500,
      discountPercent: 0,
      discountAmount: 0,
      subtotal: 1500,
      shippingCost: 450,
      isFreeShipping: false,
      total: 1950,
    },
    cod: {
      expectedAmount: 1950,
      collectedFromCustomer: true,
      settledToSeller: true,
      courierFee: 50,
      receivedAmount: 1900,
    },
  };

  const summary = computeFinancialSummary(
    [deliveredAwaiting, deliveredUnknownCost],
    [prodKnown, prodUnknown],
    [],
  );

  assert.equal(summary.netRealizedSalesRsd, 5500);
  assert.equal(summary.realizedCogsRsd, 1600); // Strictly 2 * 800; unknown not fabricated
  assert.equal(summary.itemsMissingPurchasePriceCount, 1);
  assert.equal(summary.productsMissingPurchasePriceCount, 1);
  assert.equal(summary.codAwaitingSettlementRsd, 4000);
  assert.equal(summary.codSettledReceivedRsd, 1900);
  assert.equal(summary.courierFeesRsd, 50);
});

test('Clearance preview warns below purchasePrice and rollback restores exact previous prices', () => {
  const p = makeProduct({ id: 'p-clr', salePrice: 1000, purchasePrice: 850, minAllowedPrice: 900 });
  const preview = previewClearanceMarkdown({
    products: [p],
    targetProductIds: ['p-clr'],
    mode: 'percent',
    value: 30,
    roundToEnding90: false,
  });
  assert.equal(preview[0].proposedSalePrice, 700);
  assert.ok(preview[0].warning?.includes('Ispod nabavne cene'));

  const rolledBack = applyClearanceRollbackToProducts(
    [{ ...p, salePrice: 700 }],
    {
      id: 'b-1',
      label: 'Test',
      ruleSummary: '-30%',
      appliedAt: '2026-11-10T00:00:00.000Z',
      actor: 'vlasnik',
      entries: [
        { productId: 'p-clr', productTitle: p.title, previousSalePrice: 1000, newSalePrice: 700 },
      ],
    },
  );
  assert.equal(rolledBack[0].salePrice, 1000);
});
