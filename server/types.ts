import type {
  AdminProduct,
  AdminRole,
  CategoryConfig,
  CouponCode,
  CustomerRecord,
  ExpenseRecord,
  LegalPageRecord,
  Order,
  PriceChangeBatch,
  PromotionRule,
  RestockSubscription,
  ReviewItem,
  StockMovement,
  StoreSettings,
} from '../src/types/store';

export interface AdminUserRecord {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  passwordHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminSessionRecord {
  tokenId: string;
  userId: string;
  username: string;
  displayName: string;
  role: AdminRole;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
}

export interface FullStoreDatabase {
  schemaVersion: number;
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
  adminUsers: AdminUserRecord[];
  idempotencyMap: Record<string, string>; // idempotencyKey -> orderId
}
