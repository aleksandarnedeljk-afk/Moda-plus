import {
  CATEGORY_FILTERS,
  DEFAULT_STORE_SETTINGS,
  SIZE_FILTERS,
  SORT_OPTIONS,
} from '../config/storeConfig';
import type {
  AdminProduct,
  AutoCollectionFilter,
  BundleQuantity,
  CategoryFilter,
  Order,
  OrderCustomerInput,
  OrderPricingSummary,
  Product,
  ProductSize,
  ProductVariant,
  SizeFilter,
  SortOption,
  StoreKPIs,
  StoreSettings,
} from '../types/store';

export function formatRsd(amount: number): string {
  const safeAmount = Math.round(amount);
  const sign = safeAmount < 0 ? '-' : '';
  const abs = Math.abs(safeAmount);
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${formatted} RSD`;
}

export function getDiscountPercent(originalPrice: number, salePrice: number): number {
  if (originalPrice <= 0 || salePrice >= originalPrice) return 0;
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
}

export function normalizeSerbianLatin(input: string): string {
  return input
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .trim();
}

export function generateProductSlug(title: string, id: string): string {
  const base = normalizeSerbianLatin(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${base || 'artikal'}-${id}`;
}

export function getProductPath(product: Pick<Product, 'id' | 'title' | 'slug'>): string {
  return `/artikal/${product.slug || generateProductSlug(product.title, product.id)}`;
}

export function getSizeEntries(product: Product): [ProductSize, number][] {
  if (product.variants && product.variants.length > 0) {
    const map = new Map<ProductSize, number>();
    for (const v of product.variants) {
      const avail = Math.max(0, v.physicalStock - v.reservedStock);
      map.set(v.size, (map.get(v.size) ?? 0) + avail);
    }
    return Array.from(map.entries());
  }
  return Object.entries(product.stockBySize || {}) as [ProductSize, number][];
}

export function getTotalStock(
  stockBySize: Partial<Record<ProductSize, number>>,
  variants?: ProductVariant[],
): number {
  if (variants && variants.length > 0) {
    return variants.reduce(
      (sum, v) => sum + Math.max(0, v.physicalStock - v.reservedStock),
      0,
    );
  }
  return Object.values(stockBySize || {}).reduce<number>(
    (sum, count) => sum + (count && count > 0 ? count : 0),
    0,
  );
}

export function isProductPubliclyActive(product: Product): boolean {
  if (!product.active) return false;
  if (product.status === 'Skriven' || product.status === 'Nacrt' || product.status === 'Arhiviran') {
    return false;
  }
  return true;
}

export function isSoldOut(product: Product): boolean {
  return !isProductPubliclyActive(product) || getTotalStock(product.stockBySize, product.variants) <= 0;
}

export function isStrictlyLastPiece(product: Product): boolean {
  if (isSoldOut(product)) return false;
  return getTotalStock(product.stockBySize, product.variants) === 1;
}

export function hasUrgencyStock(product: Product): boolean {
  if (isSoldOut(product)) return false;
  const total = getTotalStock(product.stockBySize, product.variants);
  if (total > 0 && total <= 2) return true;
  return getSizeEntries(product).some(([, count]) => count === 1 || count === 2);
}

export function getUrgencyBadgeText(product: Product): string | null {
  if (isSoldOut(product)) return null;
  const total = getTotalStock(product.stockBySize, product.variants);
  if (total === 1) return '🔥 Poslednji komad!';
  if (total === 2) return '⚡ Još samo 2 komada!';
  if (hasUrgencyStock(product)) return '⚡ Poslednji brojevi!';
  return null;
}

export function getFirstAvailableSize(product: Product): ProductSize | null {
  const entry = getSizeEntries(product).find(([, qty]) => qty > 0);
  return entry ? entry[0] : null;
}

export function calculateOrderTotals(
  unitSalePrice: number,
  quantity: BundleQuantity,
  settings: Pick<
    StoreSettings,
    'shippingCostRsd' | 'freeShippingThresholdRsd' | 'bundle2DiscountPercent' | 'bundle3DiscountPercent'
  > = DEFAULT_STORE_SETTINGS,
  options?: { pickupInPerson?: boolean; giftWrap?: boolean; giftWrapCostRsd?: number },
): OrderPricingSummary {
  const safePrice = Math.max(0, Math.round(unitSalePrice));
  const baseTotal = safePrice * quantity;
  const discountPercent =
    quantity === 2
      ? settings.bundle2DiscountPercent
      : quantity === 3
        ? settings.bundle3DiscountPercent
        : 0;
  const subtotal = Math.round(baseTotal * (1 - discountPercent / 100));
  const discountAmount = baseTotal - subtotal;
  const giftWrapCost = options?.giftWrap ? Math.max(0, Math.round(options.giftWrapCostRsd ?? 0)) : 0;
  const effectiveSubtotal = subtotal + giftWrapCost;
  const isFreeShipping =
    Boolean(options?.pickupInPerson) ||
    quantity >= 3 ||
    subtotal >= settings.freeShippingThresholdRsd;
  const shippingCost = isFreeShipping ? 0 : settings.shippingCostRsd;
  const total = effectiveSubtotal + shippingCost;

  return {
    unitSalePrice: safePrice,
    quantity,
    baseTotal,
    discountPercent,
    discountAmount,
    giftWrapCost,
    subtotal,
    shippingCost,
    isFreeShipping,
    total,
  };
}

export function validateSerbianMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()/]/g, '');
  if (/^06[0-9]{7,8}$/.test(cleaned)) return true;
  if (/^\+3816[0-9]{7,8}$/.test(cleaned)) return true;
  if (/^003816[0-9]{7,8}$/.test(cleaned)) return true;
  return false;
}

export function normalizeSerbianPhoneDigits(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('00381')) return `0${cleaned.slice(5)}`;
  if (cleaned.startsWith('381')) return `0${cleaned.slice(3)}`;
  return cleaned;
}

export function validateCustomerForm(
  customer: OrderCustomerInput,
  options?: { pickupInPerson?: boolean },
): Partial<Record<keyof OrderCustomerInput, string>> {
  const errors: Partial<Record<keyof OrderCustomerInput, string>> = {};

  if (!customer.fullName || customer.fullName.trim().length < 3) {
    errors.fullName = 'Unesite ime i prezime (minimum 3 karaktera).';
  }
  if (!options?.pickupInPerson) {
    if (!customer.street || customer.street.trim().length < 4) {
      errors.street = 'Unesite ulicu i kućni broj za dostavu.';
    }
    if (!customer.cityZip || customer.cityZip.trim().length < 3) {
      errors.cityZip = 'Unesite grad i poštanski broj (npr. Beograd 11000).';
    }
  }
  if (!customer.phone || !validateSerbianMobile(customer.phone)) {
    errors.phone = 'Unesite ispravan mobilni broj u Srbiji (npr. 064 123 4567).';
  }

  return errors;
}

export function buildViberOrderMessage(params: {
  brandName?: string;
  productTitle: string;
  productCode?: string;
  size: ProductSize;
  quantity: number;
  totalRsd: number;
  productUrl?: string;
}): string {
  const brand = (params.brandName || 'MODA PLUS OUTLET').trim();
  const packageLabel =
    params.quantity === 1
      ? '1 komad'
      : params.quantity === 2
        ? '2 komada (-15%)'
        : params.quantity === 3
          ? '3 komada (-20% + besplatna dostava)'
          : `${params.quantity} komada`;
  const formattedTotal = formatRsd(params.totalRsd).replace(' RSD', '');
  const parts = [
    `Zdravo ${brand}! Želim da poručim: ${params.productTitle}`,
    params.productCode ? `Šifra: ${params.productCode}` : null,
    `Veličina: ${params.size}`,
    `Paket: ${packageLabel}`,
    `Cena: ${formattedTotal} RSD`,
    params.productUrl ? `Link: ${params.productUrl}` : null,
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

export function buildViberShareUrl(params: {
  brandName?: string;
  productTitle: string;
  productCode?: string;
  size: ProductSize;
  quantity: number;
  totalRsd: number;
  productUrl?: string;
}): string {
  const message = buildViberOrderMessage(params);
  return `viber://forward?text=${encodeURIComponent(message)}`;
}

export function matchCategoryFromParam(
  rawCategory: string | null,
  availableCategories: string[] = CATEGORY_FILTERS,
): CategoryFilter {
  if (!rawCategory) return 'Sve';
  const normalized = normalizeSerbianLatin(rawCategory.replace(/\+/g, ' '));
  const match = availableCategories.find(
    (cat) => normalizeSerbianLatin(cat) === normalized,
  );
  return match ?? 'Sve';
}

export function matchSizeFromParam(rawSize: string | null): SizeFilter {
  if (!rawSize) return 'Sve veličine';
  const normalized = normalizeSerbianLatin(rawSize.replace(/\+/g, ' '));
  const match = SIZE_FILTERS.find(
    (sz) => normalizeSerbianLatin(sz) === normalized,
  );
  return match ?? 'Sve veličine';
}

export function matchSortFromParam(rawSort: string | null): SortOption {
  if (!rawSort) return 'newest';
  const found = SORT_OPTIONS.find((opt) => opt.value === rawSort);
  return found ? found.value : 'newest';
}

export function parseStoreQueryParams(
  search: string,
  availableCategories: string[] = CATEGORY_FILTERS,
): {
  category: CategoryFilter;
  size: SizeFilter;
  sort: SortOption;
  query: string;
  collection: AutoCollectionFilter;
  onlyAvailable: boolean;
  color: string;
  brand: string;
} {
  const params = new URLSearchParams(search);
  const collection = (params.get('kolekcija') as AutoCollectionFilter) || 'all';
  return {
    category: matchCategoryFromParam(params.get('kategorija'), availableCategories),
    size: matchSizeFromParam(params.get('velicina')),
    sort: matchSortFromParam(params.get('sort')),
    query: params.get('q') ?? '',
    collection,
    onlyAvailable: params.get('stanje') === '1',
    color: params.get('boja') ?? '',
    brand: params.get('brend') ?? '',
  };
}

export function buildStoreQueryParams(filters: {
  category: CategoryFilter;
  size: SizeFilter;
  sort: SortOption;
  query: string;
  collection?: AutoCollectionFilter;
  onlyAvailable?: boolean;
  color?: string;
  brand?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.category !== 'Sve') {
    params.set('kategorija', filters.category);
  }
  if (filters.size !== 'Sve veličine') {
    params.set('velicina', filters.size);
  }
  if (filters.sort !== 'newest') {
    params.set('sort', filters.sort);
  }
  if (filters.query.trim()) {
    params.set('q', filters.query.trim());
  }
  if (filters.collection && filters.collection !== 'all') {
    params.set('kolekcija', filters.collection);
  }
  if (filters.onlyAvailable) {
    params.set('stanje', '1');
  }
  if (filters.color) {
    params.set('boja', filters.color);
  }
  if (filters.brand) {
    params.set('brend', filters.brand);
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function filterAndSortProducts(
  products: Product[],
  filters: {
    category: CategoryFilter;
    size: SizeFilter;
    sort: SortOption;
    query: string;
    includeInactive?: boolean;
    showSoldOut?: boolean;
    onlyAvailable?: boolean;
    collection?: AutoCollectionFilter;
    brand?: string;
    color?: string;
    maxPrice?: number;
    minDiscount?: number;
  },
): Product[] {
  const normQuery = normalizeSerbianLatin(filters.query);

  const filtered = products.filter((product) => {
    if (!filters.includeInactive && !isProductPubliclyActive(product)) return false;

    const total = getTotalStock(product.stockBySize, product.variants);
    if (filters.onlyAvailable && total <= 0) return false;
    if (filters.showSoldOut === false && total <= 0) return false;

    if (filters.category !== 'Sve' && product.category !== filters.category) {
      return false;
    }

    if (filters.size !== 'Sve veličine') {
      const qty =
        product.variants && product.variants.length > 0
          ? product.variants
              .filter((v) => v.size === filters.size)
              .reduce((sum, v) => sum + Math.max(0, v.physicalStock - v.reservedStock), 0)
          : (product.stockBySize[filters.size] ?? 0);
      if (qty <= 0) return false;
    }

    if (filters.brand && normalizeSerbianLatin(product.brand || '') !== normalizeSerbianLatin(filters.brand)) {
      return false;
    }

    if (filters.color) {
      const targetColor = normalizeSerbianLatin(filters.color);
      const matchMain = normalizeSerbianLatin(product.color || '') === targetColor;
      const matchVar = product.variants?.some(
        (v) => normalizeSerbianLatin(v.color) === targetColor && v.physicalStock - v.reservedStock > 0,
      );
      if (!matchMain && !matchVar) return false;
    }

    if (filters.maxPrice && product.salePrice > filters.maxPrice) {
      return false;
    }

    if (filters.minDiscount && getDiscountPercent(product.originalPrice, product.salePrice) < filters.minDiscount) {
      return false;
    }

    if (filters.collection && filters.collection !== 'all') {
      switch (filters.collection) {
        case 'new':
          if (!product.isNew) return false;
          break;
        case 'last-piece':
          if (!isStrictlyLastPiece(product)) return false;
          break;
        case 'top-discount':
          if (getDiscountPercent(product.originalPrice, product.salePrice) < 50) return false;
          break;
        case 'under-999':
          if (product.salePrice > 999) return false;
          break;
        case 'under-1499':
          if (product.salePrice > 1499) return false;
          break;
        case 'under-1999':
          if (product.salePrice > 1999) return false;
          break;
        case 'under-2999':
          if (product.salePrice > 2999) return false;
          break;
        case 'bestselling':
          if ((product.soldCount ?? 0) <= 0) return false;
          break;
      }
    }

    if (normQuery) {
      const haystack = normalizeSerbianLatin(
        `${product.title} ${product.category} ${product.subcategory ?? ''} ${product.brand ?? ''} ${product.color ?? ''} ${product.sku ?? ''} ${product.description} ${product.materialNote}`,
      );
      if (!haystack.includes(normQuery)) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    const aSold = isSoldOut(a) ? 1 : 0;
    const bSold = isSoldOut(b) ? 1 : 0;
    if (aSold !== bSold) return aSold - bSold;

    switch (filters.sort) {
      case 'price-asc':
        return a.salePrice - b.salePrice;
      case 'price-desc':
        return b.salePrice - a.salePrice;
      case 'discount-desc':
        return (
          getDiscountPercent(b.originalPrice, b.salePrice) -
          getDiscountPercent(a.originalPrice, a.salePrice)
        );
      case 'bestselling':
        return (b.soldCount ?? 0) - (a.soldCount ?? 0);
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return sorted;
}

export function computeStoreKPIs(
  products: Product[],
  orders: Order[],
  referenceDate: Date = new Date(),
): StoreKPIs {
  const activeItems = products.filter(
    (p) => isProductPubliclyActive(p) && getTotalStock(p.stockBySize, p.variants) > 0,
  );
  const totalPiecesInStock = products.reduce(
    (sum, p) =>
      isProductPubliclyActive(p) ? sum + getTotalStock(p.stockBySize, p.variants) : sum,
    0,
  );

  const todayYmd = referenceDate.toISOString().slice(0, 10);
  const nonCanceledStatuses = new Set(['Otkazano', 'Vraćena']);
  const newOrdersTodayCount = orders.filter(
    (o) => !nonCanceledStatuses.has(o.status) && o.createdAt.slice(0, 10) === todayYmd,
  ).length;

  const totalRevenueRsd = orders
    .filter((o) => !nonCanceledStatuses.has(o.status))
    .reduce((sum, o) => sum + o.pricing.total, 0);

  return {
    activeItemsCount: activeItems.length,
    totalPiecesInStock,
    newOrdersTodayCount,
    totalRevenueRsd,
  };
}

/** Ensures public payloads NEVER leak internal costs or admin notes */
export function stripPrivateProductFields(product: AdminProduct): Product {
  const copy = { ...product } as Record<string, unknown>;
  delete copy.purchasePrice;
  delete copy.minAllowedPrice;
  delete copy.supplier;
  delete copy.warehouseLocation;
  delete copy.internalNote;
  delete copy.acquiredAt;
  delete copy.publishedAt;
  return copy as unknown as Product;
}
