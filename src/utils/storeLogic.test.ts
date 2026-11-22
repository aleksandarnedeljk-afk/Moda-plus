import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoreQueryParams,
  buildViberOrderMessage,
  calculateOrderTotals,
  computeStoreKPIs,
  filterAndSortProducts,
  formatRsd,
  getDiscountPercent,
  hasUrgencyStock,
  isSoldOut,
  parseStoreQueryParams,
  validateCustomerForm,
  validateSerbianMobile,
} from './storeLogic';
import type { Order, Product } from '../types/store';

const sampleProducts: Product[] = [
  {
    id: 'p1',
    title: 'Crna plisirana midi haljina',
    category: 'Ženske haljine',
    description: 'Elegantna plisirana haljina.',
    materialNote: '100% viskoza',
    salePrice: 1890,
    originalPrice: 3990,
    imageUrl: '/img1.jpg',
    stockBySize: { S: 2, M: 3, L: 0 },
    isNew: true,
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: 'p2',
    title: 'Krem oversized duks',
    category: 'Majice i duksevi',
    description: 'Mekan pamučni duks.',
    materialNote: 'Organski pamuk',
    salePrice: 2490,
    originalPrice: 4490,
    imageUrl: '/img2.jpg',
    stockBySize: { M: 5, L: 4 },
    active: true,
    createdAt: '2026-11-21T08:00:00.000Z',
  },
  {
    id: 'p3',
    title: 'Bebi pamučni komplet sa čarapicama',
    category: 'Za bebe (odelca i čarapice)',
    description: 'Nežni komplet za bebe.',
    materialNote: '100% češljani pamuk',
    salePrice: 1290,
    originalPrice: 2590,
    imageUrl: '/img3.jpg',
    stockBySize: { 'Bebi (0-24m)': 0 },
    active: true,
    createdAt: '2026-11-20T08:00:00.000Z',
  },
];

test('formatRsd formats Serbian currency with dot separator', () => {
  assert.equal(formatRsd(1690), '1.690 RSD');
  assert.equal(formatRsd(450), '450 RSD');
  assert.equal(formatRsd(12500), '12.500 RSD');
});

test('getDiscountPercent calculates accurate discount percentage', () => {
  assert.equal(getDiscountPercent(4000, 2000), 50);
  assert.equal(getDiscountPercent(3490, 1690), 52);
  assert.equal(getDiscountPercent(2000, 2500), 0);
});

test('calculateOrderTotals applies bundle discounts and free shipping rules', () => {
  // 1 komad under 4000 -> 450 RSD Post Express
  const oneLow = calculateOrderTotals(1690, 1);
  assert.equal(oneLow.discountPercent, 0);
  assert.equal(oneLow.subtotal, 1690);
  assert.equal(oneLow.shippingCost, 450);
  assert.equal(oneLow.isFreeShipping, false);
  assert.equal(oneLow.total, 2140);

  // 1 komad >= 4000 -> Free shipping
  const oneFree = calculateOrderTotals(4200, 1);
  assert.equal(oneFree.shippingCost, 0);
  assert.equal(oneFree.isFreeShipping, true);
  assert.equal(oneFree.total, 4200);

  // 2 komada -> -15% discount, subtotal 1690*2*0.85 = 2873 < 4000 -> +450 shipping
  const twoBundle = calculateOrderTotals(1690, 2);
  assert.equal(twoBundle.discountPercent, 15);
  assert.equal(twoBundle.subtotal, 2873);
  assert.equal(twoBundle.shippingCost, 450);
  assert.equal(twoBundle.total, 3323);

  // 2 komada >= 4000 -> -15% discount + Free shipping
  const twoFree = calculateOrderTotals(2500, 2);
  assert.equal(twoFree.subtotal, 4250);
  assert.equal(twoFree.shippingCost, 0);
  assert.equal(twoFree.isFreeShipping, true);

  // 3 komada -> -20% discount + ALWAYS free shipping regardless of subtotal
  const threeBundle = calculateOrderTotals(990, 3);
  assert.equal(threeBundle.discountPercent, 20);
  assert.equal(threeBundle.subtotal, 2376);
  assert.equal(threeBundle.shippingCost, 0);
  assert.equal(threeBundle.isFreeShipping, true);
  assert.equal(threeBundle.total, 2376);
});

test('validateSerbianMobile validates Serbian mobile formats', () => {
  assert.equal(validateSerbianMobile('064 123 4567'), true);
  assert.equal(validateSerbianMobile('063-889-123'), true);
  assert.equal(validateSerbianMobile('+381 65 443 2109'), true);
  assert.equal(validateSerbianMobile('011 234 5678'), false);
  assert.equal(validateSerbianMobile('06412'), false);
});

test('validateCustomerForm catches missing required fields and invalid phone', () => {
  const emptyErrors = validateCustomerForm({
    fullName: '',
    street: 'Knez Mihailova 12',
    cityZip: 'Beograd 11000',
    phone: '011223344',
  });
  assert.ok(emptyErrors.fullName);
  assert.ok(emptyErrors.phone);
  assert.equal(emptyErrors.street, undefined);

  const validErrors = validateCustomerForm({
    fullName: 'Jelena Marković',
    street: 'Bulevar oslobođenja 44',
    cityZip: 'Novi Sad 21000',
    phone: '064 551 2233',
  });
  assert.deepEqual(validErrors, {});
});

test('stock helpers detect urgency and sold-out states accurately', () => {
  assert.equal(hasUrgencyStock(sampleProducts[0]), true); // S has 2
  assert.equal(hasUrgencyStock(sampleProducts[1]), false); // M:5, L:4
  assert.equal(isSoldOut(sampleProducts[2]), true);
  assert.equal(hasUrgencyStock(sampleProducts[2]), false);
});

test('URL query param sync parses Facebook ad links with unaccented Serbian characters', () => {
  const parsed = parseStoreQueryParams('?kategorija=Zenske+haljine&velicina=M&sort=price-asc');
  assert.equal(parsed.category, 'Ženske haljine');
  assert.equal(parsed.size, 'M');
  assert.equal(parsed.sort, 'price-asc');

  const built = buildStoreQueryParams({
    category: 'Ženske haljine',
    size: 'M',
    sort: 'newest',
    query: '',
  });
  assert.equal(built, '?kategorija=%C5%BDenske+haljine&velicina=M');
});

test('filterAndSortProducts filters by category, size, diacritic-insensitive query and keeps sold-out last', () => {
  const bySearch = filterAndSortProducts(sampleProducts, {
    category: 'Sve',
    size: 'Sve veličine',
    sort: 'newest',
    query: 'carapice',
  });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, 'p3');

  const bySize = filterAndSortProducts(sampleProducts, {
    category: 'Sve',
    size: 'M',
    sort: 'price-asc',
    query: '',
  });
  assert.equal(bySize.length, 2);
  assert.equal(bySize[0].id, 'p1');
});

test('buildViberOrderMessage formats pre-filled Serbian order text', () => {
  const msg = buildViberOrderMessage({
    brandName: 'MODA PLUS OUTLET',
    productTitle: 'Crna plisirana midi haljina',
    productCode: 'MP-HALJ-101',
    size: 'M',
    quantity: 2,
    totalRsd: 3663,
    productUrl: 'https://modaplusoutlet.rs/artikal/crna-haljina',
  });
  assert.ok(msg.includes('MODA PLUS OUTLET'));
  assert.ok(msg.includes('Crna plisirana midi haljina'));
  assert.ok(msg.includes('Šifra: MP-HALJ-101'));
  assert.ok(msg.includes('Veličina: M'));
  assert.ok(msg.includes('3.663 RSD'));
  assert.ok(msg.includes('https://modaplusoutlet.rs/artikal/crna-haljina'));
});

test('computeStoreKPIs computes active items, pieces, today orders, and revenue', () => {
  const orders: Order[] = [
    {
      id: 'AO-1',
      productId: 'p1',
      productTitle: 'Haljina',
      productImage: '/img.jpg',
      selectedSize: 'M',
      bundleQuantity: 1,
      customer: {
        fullName: 'Ana',
        street: 'Ulica 1',
        cityZip: 'Beograd 11000',
        phone: '064111222',
      },
      pricing: calculateOrderTotals(1890, 1),
      status: 'Nova',
      createdAt: '2026-11-22T10:00:00.000Z',
    },
  ];
  const kpis = computeStoreKPIs(sampleProducts, orders, new Date('2026-11-22T12:00:00.000Z'));
  assert.equal(kpis.activeItemsCount, 2);
  assert.equal(kpis.totalPiecesInStock, 14);
  assert.equal(kpis.newOrdersTodayCount, 1);
  assert.equal(kpis.totalRevenueRsd, 2340);
});
