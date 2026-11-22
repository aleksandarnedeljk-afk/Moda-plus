export type DefaultProductCategory =
  | 'Ženske haljine'
  | 'Majice i duksevi'
  | 'Pantalone i farmerke'
  | 'Za bebe (odelca i čarapice)'
  | 'Ostalo';

export type ProductCategory = DefaultProductCategory | (string & {});

export type CategoryFilter = 'Sve' | ProductCategory;

export type ProductSize =
  | 'XS'
  | 'S'
  | 'M'
  | 'L'
  | 'XL'
  | 'XXL'
  | 'Bebi (0-24m)'
  | 'Univerzalna'
  | (string & {});

export type SizeFilter = 'Sve veličine' | ProductSize;

export type SortOption =
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'discount-desc'
  | 'bestselling';

export type AutoCollectionFilter =
  | 'all'
  | 'new'
  | 'last-piece'
  | 'top-discount'
  | 'under-999'
  | 'under-1499'
  | 'under-1999'
  | 'under-2999'
  | 'bestselling';

export type BundleQuantity = 1 | 2 | 3;

export type OrderStatus =
  | 'Nova'
  | 'Čeka potvrdu'
  | 'Potvrđena'
  | 'U obradi'
  | 'Spakovana'
  | 'Poslata'
  | 'U dostavi'
  | 'Isporučena'
  | 'Neuspešna dostava'
  | 'Vraćena'
  | 'Otkazano'
  | 'Reklamacija';

export type OrderSource =
  | 'Internet prodavnica'
  | 'Facebook'
  | 'Instagram'
  | 'Viber'
  | 'Telefon'
  | 'Lično preuzimanje'
  | 'Ostalo';

export type ProductLifecycleStatus =
  | 'Aktivan'
  | 'Skriven'
  | 'Nacrt'
  | 'Rasprodat'
  | 'Rezervisan'
  | 'Arhiviran';

export type GenderAgeGroup = 'Žene' | 'Muškarci' | 'Unisex' | 'Bebe' | 'Deca';

export type SizeGuideType = 'žene' | 'muškarci' | 'bebe' | 'univerzalno';

export interface ProductVariant {
  id: string;
  sku: string;
  color: string;
  size: ProductSize;
  physicalStock: number;
  reservedStock: number;
  soldCount: number;
  returnedCount: number;
  damagedCount: number;
}

export interface Product {
  id: string;
  sku?: string;
  slug?: string;
  brand?: string;
  title: string;
  category: ProductCategory;
  subcategory?: string;
  genderAge?: GenderAgeGroup;
  color?: string;
  description: string;
  materialNote: string;
  sizeGuideType?: SizeGuideType;
  salePrice: number;
  originalPrice: number;
  imageUrl: string;
  galleryImages?: string[];
  stockBySize: Partial<Record<ProductSize, number>>;
  variants?: ProductVariant[];
  isNew?: boolean;
  active: boolean;
  status?: ProductLifecycleStatus;
  soldCount?: number;
  createdAt: string;
  updatedAt?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface AdminProduct extends Product {
  purchasePrice?: number | null;
  minAllowedPrice?: number | null;
  supplier?: string;
  warehouseLocation?: string;
  internalNote?: string;
  acquiredAt?: string;
  publishedAt?: string;
}

export type StockMovementType =
  | 'Početno stanje'
  | 'Nova nabavka'
  | 'Rezervacija'
  | 'Prodaja'
  | 'Otkazivanje'
  | 'Povraćaj'
  | 'Oštećenje'
  | 'Ručna korekcija';

export interface StockMovement {
  id: string;
  productId: string;
  productTitle: string;
  variantId?: string;
  sku?: string;
  size: ProductSize;
  color?: string;
  type: StockMovementType;
  delta: number;
  physicalAfter: number;
  reservedAfter: number;
  reason: string;
  orderId?: string;
  actor: string;
  createdAt: string;
}

export interface OrderPricingSummary {
  unitSalePrice: number;
  quantity: BundleQuantity | number;
  baseTotal: number;
  discountPercent: number;
  discountAmount: number;
  promoDiscountAmount?: number;
  couponDiscountAmount?: number;
  giftWrapCost?: number;
  subtotal: number;
  shippingCost: number;
  isFreeShipping: boolean;
  total: number;
}

export interface OrderCustomerInput {
  fullName: string;
  street: string;
  cityZip: string;
  phone: string;
  email?: string;
  note?: string;
}

export interface OrderItemLine {
  productId: string;
  variantId?: string;
  sku?: string;
  title: string;
  imageUrl: string;
  size: ProductSize;
  color?: string;
  quantity: number;
  unitSalePrice: number;
  unitOriginalPrice: number;
  unitPurchasePrice?: number | null;
  returnedQty?: number;
  damagedReturnedQty?: number;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  at: string;
  actor: string;
  note?: string;
}

export interface OrderReturnRecord {
  id: string;
  orderId: string;
  reason: string;
  items: {
    productId: string;
    size: ProductSize;
    color?: string;
    returnedQty: number;
    damagedQty: number;
  }[];
  refundAmountRsd: number;
  returnShippingCostRsd: number;
  actor: string;
  createdAt: string;
}

export interface OrderShippingInfo {
  courier: 'Post Express' | 'AKS' | 'BEX' | 'D Express' | 'Lično preuzimanje';
  chargedToCustomer: number;
  actualCost: number;
  returnCost: number;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface OrderCodTracking {
  expectedAmount: number;
  collectedFromCustomer: boolean;
  settledToSeller: boolean;
  settledAt?: string;
  courierFee: number;
  receivedAmount: number;
  discrepancyNote?: string;
}

export interface Order {
  id: string;
  internalId?: string;
  idempotencyKey?: string;
  trackingToken?: string;
  source?: OrderSource;
  customerId?: string;
  // Legacy single-item fields kept populated for backwards compatibility
  productId: string;
  productTitle: string;
  productImage: string;
  selectedSize: ProductSize;
  bundleQuantity: number;
  // Multi-item normalized array
  items?: OrderItemLine[];
  couponCode?: string;
  appliedPromoName?: string;
  giftWrap?: boolean;
  pickupInPerson?: boolean;
  customer: OrderCustomerInput;
  pricing: OrderPricingSummary;
  status: OrderStatus;
  statusHistory?: OrderStatusHistoryEntry[];
  stockState?: 'none' | 'deducted' | 'released';
  shipping?: OrderShippingInfo;
  cod?: OrderCodTracking;
  returns?: OrderReturnRecord[];
  internalNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerRecord {
  id: string;
  fullName: string;
  phone: string;
  normalizedPhone: string;
  email?: string;
  street: string;
  cityZip: string;
  ordersCount: number;
  deliveredCount: number;
  uncollectedCount: number;
  returnedCount: number;
  totalSpentRsd: number;
  internalNote?: string;
  lastOrderAt: string;
  createdAt: string;
}

export interface ExpenseRecord {
  id: string;
  category: 'Ambalaža' | 'Reklama' | 'Kurirska provizija' | 'Zakup / Ostalo' | 'Porez / Naknada';
  description: string;
  amountRsd: number;
  date: string;
  createdAt: string;
}

export interface PromotionRule {
  id: string;
  name: string;
  type: 'category_percent' | 'last_piece_percent' | 'cart_threshold_percent' | 'free_shipping_threshold';
  active: boolean;
  targetCategory?: string;
  minCartRsd?: number;
  discountPercent?: number;
  stackWithBundle?: boolean;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
}

export interface CouponCode {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  value: number;
  minOrderRsd: number;
  maxUses?: number | null;
  usedCount: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface PriceChangeBatch {
  id: string;
  label: string;
  ruleSummary: string;
  appliedAt: string;
  actor: string;
  rolledBackAt?: string;
  entries: {
    productId: string;
    productTitle: string;
    previousSalePrice: number;
    newSalePrice: number;
  }[];
}

export interface ReviewItem {
  id: number | string;
  name: string;
  initials: string;
  dateLabel: string;
  rating?: number;
  comment: string;
  productId?: string;
  orderId?: string;
  verifiedPurchase?: boolean;
  status?: 'approved' | 'pending' | 'hidden';
  createdAt?: string;
}

export interface RestockSubscription {
  id: string;
  productId: string;
  productTitle: string;
  size: ProductSize;
  contact: string;
  consentGiven: boolean;
  notified: boolean;
  createdAt: string;
}

export interface CategoryConfig {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  visible: boolean;
}

export interface LegalPageRecord {
  slug:
    | 'o-nama'
    | 'kontakt'
    | 'uslovi-kupovine'
    | 'politika-privatnosti'
    | 'dostava-i-placanje'
    | 'reklamacije'
    | 'povracaj-robe'
    | 'odustanak-od-kupovine';
  title: string;
  content: string;
  updatedAt: string;
}

export interface StoreSettings {
  brandName: string;
  brandSubtitle: string;
  secondarySlogan?: string;
  logoMonogram?: string;
  announcementText: string;
  holidayBannerText: string;
  holidayBannerActive: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  contactPhoneDisplay: string;
  contactViberNumber: string;
  contactEmail: string;
  instagramHandle: string;
  facebookPageUrl: string;
  dispatchHours: string;
  shippingCostRsd: number;
  freeShippingThresholdRsd: number;
  bundle2DiscountPercent: number;
  bundle3DiscountPercent: number;
  giftWrapCostRsd: number;
  enablePickupInPerson: boolean;
  pickupAddress: string;
  showSoldOutProducts: boolean;
  autoLockMinutes: number;
  // Legal entity fields — must be filled by store owner before public launch
  legalCompanyName: string;
  legalSeatAddress: string;
  legalPib: string;
  legalMb: string;
  legalBankAccount: string;
  // Optional marketing/analytics IDs (disabled unless configured + consent given)
  metaPixelId: string;
  ga4MeasurementId: string;
  gscVerificationTag: string;
}

export type AdminRole = 'vlasnik' | 'zaposleni';

export interface AdminUserPublic {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminAlert {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  description: string;
  targetTab?: string;
  count?: number;
}

export interface CartItem {
  productId: string;
  size: ProductSize;
  color?: string;
  quantity: number;
}

export interface StoreKPIs {
  activeItemsCount: number;
  totalPiecesInStock: number;
  newOrdersTodayCount: number;
  totalRevenueRsd: number;
}
