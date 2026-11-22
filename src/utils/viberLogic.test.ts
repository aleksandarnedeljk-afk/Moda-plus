import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORE_SETTINGS } from '../config/storeConfig';
import type { CartItem, Product } from '../types/store';
import { computeCartTotals } from './cartAndPromoLogic';
import {
  buildCartViberMessage,
  buildDetailedProductViberMessage,
  buildTelHref,
  buildViberDirectChatUrl,
  buildViberForwardTextUrl,
  getDisplayDevicePlatform,
  normalizeToInternationalPhone,
} from './viberLogic';

const sampleProducts: Product[] = [
  {
    id: 'p-dress-1',
    sku: 'MP-HALJ-101',
    slug: 'crna-midi-haljina-p-dress-1',
    title: 'Crna plisirana midi haljina',
    category: 'Ženske haljine',
    description: 'Elegantna midi haljina.',
    materialNote: '100% viskoza',
    salePrice: 1890,
    originalPrice: 3990,
    imageUrl: '/img1.jpg',
    stockBySize: { S: 2, M: 3 },
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: 'p-hoodie-2',
    sku: 'MP-DUKS-202',
    slug: 'krem-pamucni-duks-p-hoodie-2',
    title: 'Krem pamučni duks za celu porodicu',
    category: 'Majice i duksevi',
    description: 'Mekan duks.',
    materialNote: 'Organski pamuk',
    salePrice: 2490,
    originalPrice: 4490,
    imageUrl: '/img2.jpg',
    stockBySize: { M: 4, L: 2 },
    active: true,
    createdAt: '2026-11-21T08:00:00.000Z',
  },
];

test('normalizeToInternationalPhone normalizes Serbian phone numbers to +381 format', () => {
  assert.equal(normalizeToInternationalPhone('069 230 5074'), '+381692305074');
  assert.equal(normalizeToInternationalPhone('069-230-5074'), '+381692305074');
  assert.equal(normalizeToInternationalPhone('+381 69 230 5074'), '+381692305074');
  assert.equal(normalizeToInternationalPhone('00381692305074'), '+381692305074');
  assert.equal(normalizeToInternationalPhone(''), '+381692305074');
});

test('buildTelHref and Viber URL builders produce valid tel and viber scheme links', () => {
  assert.equal(buildTelHref('069 230 5074'), 'tel:+381692305074');
  assert.equal(
    buildViberDirectChatUrl('069 230 5074'),
    'viber://chat?number=%2B381692305074',
  );
  const fwd = buildViberForwardTextUrl('Zdravo MODA PLUS OUTLET');
  assert.equal(fwd, 'viber://forward?text=Zdravo%20MODA%20PLUS%20OUTLET');
});

test('buildDetailedProductViberMessage includes brand, title, SKU, size, qty, price, and direct URL', () => {
  const msg = buildDetailedProductViberMessage({
    brandName: 'MODA PLUS OUTLET',
    product: sampleProducts[0],
    size: 'M',
    quantity: 2,
    unitOrTotalPriceRsd: 3213,
    origin: 'https://modaplusoutlet.rs',
  });

  assert.ok(msg.includes('MODA PLUS OUTLET'));
  assert.ok(msg.includes('Crna plisirana midi haljina'));
  assert.ok(msg.includes('MP-HALJ-101'));
  assert.ok(msg.includes('Veličina: M'));
  assert.ok(msg.includes('Količina: 2 kom'));
  assert.ok(msg.includes('3.213 RSD'));
  assert.ok(msg.includes('https://modaplusoutlet.rs/artikal/crna-midi-haljina-p-dress-1'));
});

test('buildCartViberMessage summarizes full cart contents with SKUs, links, shipping, and total', () => {
  const cartItems: CartItem[] = [
    { productId: 'p-dress-1', size: 'S', quantity: 1 },
    { productId: 'p-hoodie-2', size: 'L', quantity: 1 },
  ];
  const summary = computeCartTotals({
    cartItems,
    products: sampleProducts,
    settings: DEFAULT_STORE_SETTINGS,
    promotions: [],
  });

  const msg = buildCartViberMessage({
    brandName: DEFAULT_STORE_SETTINGS.brandName,
    cartItems,
    products: sampleProducts,
    summary,
    settings: DEFAULT_STORE_SETTINGS,
    origin: 'https://modaplusoutlet.rs',
  });

  assert.ok(msg.includes('MODA PLUS OUTLET'));
  assert.ok(msg.includes('Crna plisirana midi haljina'));
  assert.ok(msg.includes('MP-HALJ-101'));
  assert.ok(msg.includes('Krem pamučni duks za celu porodicu'));
  assert.ok(msg.includes('MP-DUKS-202'));
  assert.ok(msg.includes('https://modaplusoutlet.rs/artikal/krem-pamucni-duks-p-hoodie-2'));
  assert.ok(msg.includes('Ukupno:'));
});

test('getDisplayDevicePlatform classifies Android, iPhone/iPad, and Desktop user agents', () => {
  assert.equal(
    getDisplayDevicePlatform(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    ),
    'android',
  );
  assert.equal(
    getDisplayDevicePlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    ),
    'ios',
  );
  assert.equal(
    getDisplayDevicePlatform(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    ),
    'desktop',
  );
});
