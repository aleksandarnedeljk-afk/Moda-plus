import type {
  AdminAlert,
  AdminProduct,
  AdminUserPublic,
  BundleQuantity,
  CategoryConfig,
  CouponCode,
  CustomerRecord,
  ExpenseRecord,
  LegalPageRecord,
  Order,
  OrderCustomerInput,
  OrderSource,
  OrderStatus,
  PriceChangeBatch,
  Product,
  ProductSize,
  PromotionRule,
  RestockSubscription,
  ReviewItem,
  StockMovement,
  StoreSettings,
} from '../types/store';
import type { FinancialSummary, ClearancePreviewRow } from './financeLogic';

// Admin Bearer token kept strictly in JS memory (never localStorage/sessionStorage)
let inMemoryAdminToken: string | null = null;

export function setAdminSessionToken(token: string | null) {
  inMemoryAdminToken = token;
}

export function getAdminSessionToken(): string | null {
  return inMemoryAdminToken;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (inMemoryAdminToken) {
    headers.Authorization = `Bearer ${inMemoryAdminToken}`;
  }
  return headers;
}

export interface TrackedOrderSummary {
  id: string;
  status: OrderStatus;
  productTitle: string;
  selectedSize: ProductSize;
  bundleQuantity: number;
  itemsCount: number;
  total: number;
  cityZip: string;
  courier: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
  statusHistory: { status: OrderStatus; at: string }[];
}

export interface StorefrontBootstrap {
  products: Product[];
  categories: CategoryConfig[];
  legalPages: LegalPageRecord[];
  settings: StoreSettings;
  promotions: PromotionRule[];
  reviews: ReviewItem[];
}

export interface AdminBootstrapData {
  products: AdminProduct[];
  orders: Order[];
  customers: CustomerRecord[];
  stockMovements: StockMovement[];
  priceHistory: PriceChangeBatch[];
  expenses: ExpenseRecord[];
  promotions: PromotionRule[];
  coupons: CouponCode[];
  reviews: ReviewItem[];
  restockSubscriptions: RestockSubscription[];
  categories: CategoryConfig[];
  legalPages: LegalPageRecord[];
  settings: StoreSettings;
  users: AdminUserPublic[];
  financials: FinancialSummary;
  stats: {
    ordersCount: number;
    activeOrdersCount: number;
    deliveredCount: number;
    canceledOrReturnedCount: number;
    totalRevenueRsd: number;
    aovRsd: number;
    returnRatePercent: number;
    byCategory: Record<string, { revenue: number; pieces: number }>;
    bySize: Record<string, number>;
    bySource: Record<string, { orders: number; revenue: number }>;
    topProducts: { id: string; title: string; pieces: number; revenue: number }[];
    zeroSaleProducts: { id: string; title: string; stock: number; salePrice: number }[];
    dailySeries: { date: string; revenue: number; orders: number }[];
  };
  alerts: AdminAlert[];
  backups: { fileName: string; sizeBytes: number; createdAt: string }[];
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      inMemoryAdminToken = null;
    }
    throw new Error(
      (data as { error?: string }).error || 'Došlo je do greške u komunikaciji sa serverom.',
    );
  }
  return data as T;
}

// ===================================
// PUBLIC STOREFRONT APIS
// ===================================
export async function fetchStorefront(): Promise<StorefrontBootstrap> {
  const res = await fetch('/api/storefront');
  return handleJson<StorefrontBootstrap>(res);
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch('/api/products');
  const data = await handleJson<{ products: Product[] }>(res);
  return data.products;
}

export async function fetchProductBySlugOrId(slugOrId: string): Promise<Product> {
  const res = await fetch(`/api/products/${encodeURIComponent(slugOrId)}`);
  const data = await handleJson<{ product: Product }>(res);
  return data.product;
}

export async function validateCouponApi(code: string): Promise<CouponCode> {
  const res = await fetch('/api/promotions/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await handleJson<{ coupon: CouponCode }>(res);
  return data.coupon;
}

export async function submitOrderApi(payload: {
  productId?: string;
  selectedSize?: ProductSize;
  bundleQuantity?: BundleQuantity;
  items?: { productId: string; size: ProductSize; color?: string; quantity: number }[];
  customer: OrderCustomerInput;
  couponCode?: string;
  giftWrap?: boolean;
  pickupInPerson?: boolean;
  idempotencyKey?: string;
}): Promise<{
  order: Order;
  updatedProduct?: Product;
  updatedProducts?: Product[];
  idempotentReplay?: boolean;
}> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function trackOrderApi(
  code: string,
  phoneLast4: string,
  token?: string,
): Promise<TrackedOrderSummary[]> {
  const params = new URLSearchParams({ code, phoneLast4 });
  if (token) params.set('token', token);
  const res = await fetch(`/api/orders/track?${params.toString()}`);
  const data = await handleJson<{ matches: TrackedOrderSummary[] }>(res);
  return data.matches;
}

export async function submitReviewApi(payload: {
  orderCode: string;
  phoneLast4: string;
  rating: number;
  comment: string;
  productId?: string;
}): Promise<{ review: ReviewItem; message: string }> {
  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function subscribeRestockAlertApi(payload: {
  productId: string;
  size: ProductSize;
  contact: string;
  consentGiven: boolean;
}): Promise<void> {
  const res = await fetch('/api/restock-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleJson(res);
}

// ===================================
// AUTH APIS
// ===================================
export async function getAuthStatusApi(): Promise<{
  needsInitialSetup: boolean;
  envPasscodeActive: boolean;
  ownerDisplayName: string;
}> {
  const res = await fetch('/api/auth/status');
  return handleJson(res);
}

export async function setupInitialOwnerApi(payload: {
  username?: string;
  displayName?: string;
  password: string;
}): Promise<{ token: string; user: AdminUserPublic }> {
  const res = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ token: string; user: AdminUserPublic }>(res);
  setAdminSessionToken(data.token);
  return data;
}

export async function loginAdminApi(payload: {
  username?: string;
  password: string;
}): Promise<{ token: string; user: AdminUserPublic }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ token: string; user: AdminUserPublic }>(res);
  setAdminSessionToken(data.token);
  return data;
}

export async function logoutAdminApi(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders(),
  }).catch(() => undefined);
  setAdminSessionToken(null);
}

export async function getCurrentAdminUserApi(): Promise<AdminUserPublic | null> {
  if (!inMemoryAdminToken) return null;
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) {
      setAdminSessionToken(null);
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function changeAdminPasswordApi(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await handleJson<{ token: string }>(res);
  setAdminSessionToken(data.token);
}

// ===================================
// PROTECTED ADMIN APIS
// ===================================
export async function fetchAdminBootstrapApi(
  from?: string,
  to?: string,
): Promise<AdminBootstrapData> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const res = await fetch(`/api/admin/bootstrap${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  return handleJson<AdminBootstrapData>(res);
}

export async function createProductApi(payload: Partial<AdminProduct>): Promise<AdminProduct> {
  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ product: AdminProduct }>(res);
  return data.product;
}

export async function updateProductApi(
  id: string,
  patch: Partial<AdminProduct>,
): Promise<AdminProduct> {
  const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await handleJson<{ product: AdminProduct }>(res);
  return data.product;
}

export async function deleteProductApi(id: string): Promise<void> {
  const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await handleJson<{ deletedId: string }>(res);
}

export async function bulkUploadProductsApi(
  items: {
    title: string;
    category: string;
    salePrice: number;
    originalPrice?: number;
    purchasePrice?: number | null;
    imageUrl: string;
    stockBySize: Partial<Record<ProductSize, number>>;
  }[],
): Promise<AdminProduct[]> {
  const res = await fetch('/api/admin/products/bulk-upload', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items }),
  });
  const data = await handleJson<{ products: AdminProduct[] }>(res);
  return data.products;
}

export async function aiSuggestProductApi(
  imageDataUrl?: string,
  sellerNotes?: string,
): Promise<{
  title: string;
  category: string;
  color: string;
  shortDescription: string;
}> {
  const res = await fetch('/api/admin/ai-suggest', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ imageDataUrl, sellerNotes }),
  });
  const data = await handleJson<{
    suggestion: { title: string; category: string; color: string; shortDescription: string };
  }>(res);
  return data.suggestion;
}

export async function reconcileInventoryApi(payload: {
  productId: string;
  adjustments: { size: ProductSize; color?: string; newPhysicalStock: number }[];
  reason: string;
}): Promise<AdminProduct> {
  const res = await fetch('/api/admin/inventory/adjust', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ product: AdminProduct }>(res);
  return data.product;
}

export async function createManualOrderApi(payload: {
  items: {
    productId: string;
    size: ProductSize;
    color?: string;
    quantity: number;
    customUnitPrice?: number;
  }[];
  customer: OrderCustomerInput;
  source: OrderSource;
  initialStatus?: OrderStatus;
  shippingOverrideRsd?: number;
  pickupInPerson?: boolean;
  giftWrap?: boolean;
  internalNote?: string;
}): Promise<{ order: Order; updatedProducts: AdminProduct[] }> {
  const res = await fetch('/api/admin/orders/manual', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function updateOrderStatusApi(
  id: string,
  status: OrderStatus,
  extras?: {
    trackingNumber?: string;
    actualShippingCost?: number;
    returnCost?: number;
    note?: string;
  },
): Promise<{ order: Order; updatedProducts: AdminProduct[] }> {
  const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status, ...extras }),
  });
  return handleJson(res);
}

export async function bulkOrderStatusApi(orderIds: string[], status: OrderStatus): Promise<Order[]> {
  const res = await fetch('/api/admin/orders/bulk-status', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderIds, status }),
  });
  const data = await handleJson<{ orders: Order[] }>(res);
  return data.orders;
}

export async function processOrderReturnApi(
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
): Promise<{ order: Order; updatedProducts: AdminProduct[] }> {
  const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/return`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function settleCodOrdersApi(
  settlements: {
    orderId: string;
    receivedAmount?: number;
    courierFee?: number;
    discrepancyNote?: string;
  }[],
): Promise<Order[]> {
  const res = await fetch('/api/admin/orders/cod-settle', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ settlements }),
  });
  const data = await handleJson<{ orders: Order[] }>(res);
  return data.orders;
}

export async function updateCustomerApi(
  id: string,
  patch: Partial<CustomerRecord>,
): Promise<CustomerRecord> {
  const res = await fetch(`/api/admin/customers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await handleJson<{ customer: CustomerRecord }>(res);
  return data.customer;
}

export async function mergeCustomersApi(
  primaryId: string,
  duplicateId: string,
): Promise<CustomerRecord> {
  const res = await fetch('/api/admin/customers/merge', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ primaryId, duplicateId }),
  });
  const data = await handleJson<{ customer: CustomerRecord }>(res);
  return data.customer;
}

export async function previewClearanceApi(payload: {
  targetProductIds: string[];
  mode: 'percent' | 'fixed_rsd';
  value: number;
  roundToEnding90?: boolean;
}): Promise<ClearancePreviewRow[]> {
  const res = await fetch('/api/admin/clearance/preview', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ preview: ClearancePreviewRow[] }>(res);
  return data.preview;
}

export async function applyClearanceApi(payload: {
  label: string;
  targetProductIds: string[];
  mode: 'percent' | 'fixed_rsd';
  value: number;
  roundToEnding90?: boolean;
}): Promise<{ batch: PriceChangeBatch; updatedProducts: AdminProduct[] }> {
  const res = await fetch('/api/admin/clearance/apply', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function rollbackClearanceApi(
  batchId: string,
): Promise<{ batch: PriceChangeBatch; updatedProducts: AdminProduct[] }> {
  const res = await fetch(`/api/admin/clearance/rollback/${encodeURIComponent(batchId)}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleJson(res);
}

export async function createExpenseApi(payload: {
  category: ExpenseRecord['category'];
  description: string;
  amountRsd: number;
  date?: string;
}): Promise<ExpenseRecord> {
  const res = await fetch('/api/admin/expenses', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ expense: ExpenseRecord }>(res);
  return data.expense;
}

export async function createPromotionApi(payload: Partial<PromotionRule>): Promise<PromotionRule> {
  const res = await fetch('/api/admin/promotions', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ promotion: PromotionRule }>(res);
  return data.promotion;
}

export async function updatePromotionApi(
  id: string,
  patch: Partial<PromotionRule>,
): Promise<PromotionRule> {
  const res = await fetch(`/api/admin/promotions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await handleJson<{ promotion: PromotionRule }>(res);
  return data.promotion;
}

export async function createCouponApi(payload: Partial<CouponCode>): Promise<CouponCode> {
  const res = await fetch('/api/admin/coupons', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ coupon: CouponCode }>(res);
  return data.coupon;
}

export async function updateCouponApi(
  id: string,
  patch: Partial<CouponCode>,
): Promise<CouponCode> {
  const res = await fetch(`/api/admin/coupons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await handleJson<{ coupon: CouponCode }>(res);
  return data.coupon;
}

export async function moderateReviewApi(
  id: string | number,
  status: 'approved' | 'pending' | 'hidden',
): Promise<ReviewItem> {
  const res = await fetch(`/api/admin/reviews/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
  const data = await handleJson<{ review: ReviewItem }>(res);
  return data.review;
}

export async function updateSettingsApi(patch: Partial<StoreSettings>): Promise<StoreSettings> {
  const res = await fetch('/api/admin/settings', {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await handleJson<{ settings: StoreSettings }>(res);
  return data.settings;
}

export async function updateCategoriesApi(
  categories: { id?: string; name: string; visible?: boolean; sortOrder?: number }[],
): Promise<CategoryConfig[]> {
  const res = await fetch('/api/admin/categories', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ categories }),
  });
  const data = await handleJson<{ categories: CategoryConfig[] }>(res);
  return data.categories;
}

export async function updateLegalPageApi(
  slug: string,
  title: string,
  content: string,
): Promise<LegalPageRecord> {
  const res = await fetch(`/api/admin/legal/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title, content }),
  });
  const data = await handleJson<{ legalPage: LegalPageRecord }>(res);
  return data.legalPage;
}

export async function createAdminUserApi(payload: {
  username: string;
  displayName: string;
  password: string;
  role: 'vlasnik' | 'zaposleni';
}): Promise<AdminUserPublic> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ user: AdminUserPublic }>(res);
  return data.user;
}

export async function previewCsvImportApi(csvText: string) {
  const res = await fetch('/api/admin/import/products', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ csvText, commit: false }),
  });
  return handleJson<{
    preview: {
      rowIndex: number;
      sku: string;
      title: string;
      category: string;
      salePrice: number;
      duplicateReason?: string;
      error?: string;
    }[];
  }>(res);
}

export async function commitCsvImportApi(csvText: string, skipDuplicates = true) {
  const res = await fetch('/api/admin/import/products', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ csvText, commit: true, skipDuplicates }),
  });
  return handleJson<{ importedCount: number; products: AdminProduct[] }>(res);
}

export async function downloadAdminCsvApi(
  type: 'products' | 'orders' | 'courier' | 'customers' | 'finances',
) {
  const res = await fetch(`/api/admin/export/${type}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Greška pri preuzimanju CSV izveštaja.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `modaplus-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function createBackupApi() {
  const res = await fetch('/api/admin/backups/create', {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleJson<{
    backup: { fileName: string; sizeBytes: number; createdAt: string };
    backups: { fileName: string; sizeBytes: number; createdAt: string }[];
  }>(res);
}

export async function downloadBackupApi(fileName?: string) {
  const qs = fileName ? `?file=${encodeURIComponent(fileName)}` : '';
  const res = await fetch(`/api/admin/backups/download${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Greška pri preuzimanju rezervnog snimka.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || `modaplus-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreBackupApi(payload: {
  fileName?: string;
  snapshot?: unknown;
}): Promise<{ ok: boolean; restoredProducts: number }> {
  const res = await fetch('/api/admin/backups/restore', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}
