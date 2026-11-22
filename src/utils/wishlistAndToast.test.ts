import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createToastItem,
  enqueueToast,
  getWishlistProducts,
  toggleWishlistItem,
} from './wishlistAndToast';
import type { Product } from '../types/store';

const mockProducts: Product[] = [
  {
    id: 'p1',
    title: 'Crna plisirana haljina',
    category: 'Ženske haljine',
    description: 'Opis',
    materialNote: 'Viskoza',
    salePrice: 2290,
    originalPrice: 4990,
    imageUrl: '/a.jpg',
    stockBySize: { M: 2 },
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: 'p2',
    title: 'Krem duks',
    category: 'Majice i duksevi',
    description: 'Opis',
    materialNote: 'Pamuk',
    salePrice: 1890,
    originalPrice: 3990,
    imageUrl: '/b.jpg',
    stockBySize: { L: 3 },
    active: false,
    createdAt: '2026-11-21T08:00:00.000Z',
  },
];

test('toggleWishlistItem adds new item to front and removes existing item', () => {
  const first = toggleWishlistItem([], 'p1');
  assert.deepEqual(first.nextIds, ['p1']);
  assert.equal(first.added, true);

  const second = toggleWishlistItem(first.nextIds, 'p2');
  assert.deepEqual(second.nextIds, ['p2', 'p1']);
  assert.equal(second.added, true);

  const removed = toggleWishlistItem(second.nextIds, 'p1');
  assert.deepEqual(removed.nextIds, ['p2']);
  assert.equal(removed.added, false);
});

test('getWishlistProducts preserves wishlist order and filters inactive products', () => {
  const activeOnly = getWishlistProducts(mockProducts, ['p2', 'p1', 'missing']);
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].id, 'p1');
});

test('enqueueToast caps visible toasts at maxVisible keeping newest', () => {
  let queue = enqueueToast([], createToastItem({ kind: 'info', title: 'One' }), 3);
  queue = enqueueToast(queue, createToastItem({ kind: 'wishlist-add', title: 'Two' }), 3);
  queue = enqueueToast(queue, createToastItem({ kind: 'wishlist-remove', title: 'Three' }), 3);
  queue = enqueueToast(queue, createToastItem({ kind: 'order', title: 'Four' }), 3);

  assert.equal(queue.length, 3);
  assert.deepEqual(
    queue.map((t) => t.title),
    ['Two', 'Three', 'Four'],
  );
});
