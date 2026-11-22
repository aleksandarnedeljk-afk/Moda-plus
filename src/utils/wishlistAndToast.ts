import type { Product } from '../types/store';

export type ToastKind = 'order' | 'wishlist-add' | 'wishlist-remove' | 'info';

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  createdAt: number;
}

export const WISHLIST_STORAGE_KEY = 'atelier_outlet_wishlist_v1';

export function toggleWishlistItem(
  currentIds: string[],
  productId: string,
): { nextIds: string[]; added: boolean } {
  const exists = currentIds.includes(productId);
  if (exists) {
    return {
      nextIds: currentIds.filter((id) => id !== productId),
      added: false,
    };
  }
  return {
    nextIds: [productId, ...currentIds],
    added: true,
  };
}

export function getWishlistProducts(
  products: Product[],
  wishlistIds: string[],
): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const result: Product[] = [];
  for (const id of wishlistIds) {
    const prod = byId.get(id);
    if (prod && prod.active) {
      result.push(prod);
    }
  }
  return result;
}

export function createToastItem(input: {
  kind: ToastKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}): ToastMessage {
  return {
    id: `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind: input.kind,
    title: input.title,
    message: input.message,
    actionLabel: input.actionLabel,
    onAction: input.onAction,
    createdAt: Date.now(),
  };
}

export function enqueueToast(
  current: ToastMessage[],
  next: ToastMessage,
  maxVisible: number = 3,
): ToastMessage[] {
  const updated = [...current, next];
  if (updated.length <= maxVisible) return updated;
  return updated.slice(updated.length - maxVisible);
}
