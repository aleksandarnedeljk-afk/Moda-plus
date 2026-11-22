import type { CartItem, Product, ProductSize, StoreSettings } from '../types/store';
import type { CartSummary } from './cartAndPromoLogic';
import { formatRsd, getFirstAvailableSize, getProductPath } from './storeLogic';

export type ViberDevicePlatform = 'android' | 'ios' | 'desktop';

export function normalizeToInternationalPhone(
  rawPhone: string,
  fallback = '+381692305074',
): string {
  const cleaned = String(rawPhone || '').replace(/[^\d+]/g, '');
  if (!cleaned) return fallback;
  if (cleaned.startsWith('+')) {
    return cleaned.length >= 9 ? cleaned : fallback;
  }
  if (cleaned.startsWith('00')) {
    const rest = cleaned.slice(2);
    return rest.length >= 8 ? `+${rest}` : fallback;
  }
  if (cleaned.startsWith('381')) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('0') && cleaned.length >= 8) {
    return `+381${cleaned.slice(1)}`;
  }
  return `+${cleaned}`;
}

export function buildTelHref(rawPhone: string): string {
  return `tel:${normalizeToInternationalPhone(rawPhone)}`;
}

export function buildViberDirectChatUrl(viberNumber: string): string {
  const normalized = normalizeToInternationalPhone(viberNumber);
  return `viber://chat?number=${encodeURIComponent(normalized)}`;
}

export function buildViberForwardTextUrl(message: string): string {
  return `viber://forward?text=${encodeURIComponent(message)}`;
}

export function buildDetailedProductViberMessage(params: {
  brandName?: string;
  product: Product;
  size?: ProductSize;
  quantity?: number;
  unitOrTotalPriceRsd?: number;
  origin?: string;
}): string {
  const brand = (params.brandName || 'MODA PLUS OUTLET').trim();
  const activeSize = params.size || getFirstAvailableSize(params.product) || 'Univerzalna';
  const qty = Math.max(1, Math.round(params.quantity ?? 1));
  const priceRsd = params.unitOrTotalPriceRsd ?? params.product.salePrice * qty;
  const skuOrId = params.product.sku?.trim() || params.product.id;
  const origin =
    params.origin ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  const productUrl = `${origin}${getProductPath(params.product)}`;

  return [
    `Zdravo ${brand}! Želim da poručim artikal preko Vibera:`,
    `• Naziv: ${params.product.title}`,
    `• Šifra: ${skuOrId}`,
    `• Veličina: ${activeSize}`,
    `• Količina: ${qty} kom`,
    `• Cena: ${formatRsd(priceRsd)}`,
    `• Link: ${productUrl}`,
  ].join('\n');
}

export function buildCartViberMessage(params: {
  brandName?: string;
  cartItems: CartItem[];
  products: Product[];
  summary: CartSummary;
  settings: StoreSettings;
  pickupInPerson?: boolean;
  giftWrap?: boolean;
  origin?: string;
}): string {
  const brand = (params.brandName || params.settings.brandName || 'MODA PLUS OUTLET').trim();
  const origin =
    params.origin ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  const productMap = new Map(params.products.map((p) => [p.id, p]));

  const lines: string[] = [
    `Zdravo ${brand}! Želim da poručim sadržaj korpe preko Vibera:`,
    '',
  ];

  params.cartItems.forEach((item, index) => {
    const prod = productMap.get(item.productId);
    if (!prod) return;
    const skuOrId = prod.sku?.trim() || prod.id;
    const linePrice = formatRsd(prod.salePrice * item.quantity);
    const url = `${origin}${getProductPath(prod)}`;
    lines.push(
      `${index + 1}. ${prod.title}`,
      `   Šifra: ${skuOrId} | Veličina: ${item.size} | Količina: ${item.quantity} kom | Cena: ${linePrice}`,
      `   Link: ${url}`,
    );
  });

  lines.push('');
  if (params.summary.bundleDiscountAmount > 0) {
    lines.push(
      `• Paket popust (-${params.summary.bundleDiscountPercent}%): -${formatRsd(params.summary.bundleDiscountAmount)}`,
    );
  }
  if (params.summary.promoDiscountAmount > 0 && params.summary.appliedPromoName) {
    lines.push(
      `• Akcija (${params.summary.appliedPromoName}): -${formatRsd(params.summary.promoDiscountAmount)}`,
    );
  }
  if (params.summary.couponDiscountAmount > 0 && params.summary.appliedCouponCode) {
    lines.push(
      `• Kupon (${params.summary.appliedCouponCode}): -${formatRsd(params.summary.couponDiscountAmount)}`,
    );
  }
  if (params.giftWrap && params.summary.giftWrapCost > 0) {
    lines.push(`• Poklon pakovanje: +${formatRsd(params.summary.giftWrapCost)}`);
  }
  lines.push(
    `• Dostava: ${params.pickupInPerson ? 'Lično preuzimanje (0 RSD)' : params.summary.isFreeShipping ? 'Besplatna (0 RSD)' : formatRsd(params.summary.shippingCost)}`,
  );
  lines.push(`• Ukupno: ${formatRsd(params.summary.total)}`);

  return lines.join('\n');
}

export function getDisplayDevicePlatform(userAgent?: string): ViberDevicePlatform {
  const ua = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  ).toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}
