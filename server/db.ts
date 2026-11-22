import fs from 'fs';
import path from 'path';
import {
  DEFAULT_LEGAL_PAGES,
  DEFAULT_STORE_SETTINGS,
  PRODUCT_CATEGORIES,
} from '../src/config/storeConfig';
import { CUSTOMER_REVIEWS } from '../src/data/reviews';
import { SEED_ORDERS, SEED_PRODUCTS } from '../src/data/seedProducts';
import type {
  AdminProduct,
  CategoryConfig,
  CustomerRecord,
  Order,
  ProductSize,
  ProductVariant,
  ReviewItem,
} from '../src/types/store';
import {
  generateProductSlug,
  normalizeSerbianLatin,
  normalizeSerbianPhoneDigits,
} from '../src/utils/storeLogic';
import type { FullStoreDatabase } from './types';

export function syncProductStockFields(product: AdminProduct): AdminProduct {
  const skuPrefix = product.sku || `SKU-${product.id.toUpperCase()}`;
  const defaultColor = product.color?.trim() || 'Osnovna';

  let variants: ProductVariant[] = Array.isArray(product.variants)
    ? product.variants.map((v) => ({
        ...v,
        physicalStock: Math.max(0, Math.floor(v.physicalStock || 0)),
        reservedStock: Math.max(0, Math.floor(v.reservedStock || 0)),
        soldCount: Math.max(0, Math.floor(v.soldCount || 0)),
        returnedCount: Math.max(0, Math.floor(v.returnedCount || 0)),
        damagedCount: Math.max(0, Math.floor(v.damagedCount || 0)),
      }))
    : [];

  if (variants.length === 0 && product.stockBySize) {
    variants = Object.entries(product.stockBySize).map(([size, qty]) => {
      const cleanQty = Math.max(0, Math.floor(Number(qty) || 0));
      const cleanSize = size as ProductSize;
      return {
        id: `${product.id}-${normalizeSerbianLatin(size).replace(/[^a-z0-9]/g, '') || 'u'}`,
        sku: `${skuPrefix}-${normalizeSerbianLatin(size).replace(/[^a-z0-9]/g, '').toUpperCase() || 'U'}`,
        color: defaultColor,
        size: cleanSize,
        physicalStock: cleanQty,
        reservedStock: 0,
        soldCount: 0,
        returnedCount: 0,
        damagedCount: 0,
      };
    });
  }

  const stockBySize: Partial<Record<ProductSize, number>> = {};
  for (const v of variants) {
    const available = Math.max(0, v.physicalStock - v.reservedStock);
    stockBySize[v.size] = (stockBySize[v.size] ?? 0) + available;
  }

  const totalAvail = Object.values(stockBySize).reduce<number>((s, n) => s + (n ?? 0), 0);
  const status =
    product.status ||
    (!product.active ? 'Skriven' : totalAvail <= 0 ? 'Rasprodat' : 'Aktivan');

  return {
    ...product,
    sku: skuPrefix,
    slug: product.slug || generateProductSlug(product.title, product.id),
    color: defaultColor,
    galleryImages:
      product.galleryImages && product.galleryImages.length > 0
        ? product.galleryImages
        : [product.imageUrl],
    variants,
    stockBySize,
    status,
    soldCount: product.soldCount ?? variants.reduce((s, v) => s + v.soldCount, 0),
  };
}

function buildDefaultCategories(): CategoryConfig[] {
  return PRODUCT_CATEGORIES.map((name, idx) => ({
    id: `cat-${idx + 1}`,
    name,
    slug: normalizeSerbianLatin(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    sortOrder: idx + 1,
    visible: true,
  }));
}

function migrateLegacyStatus(status: string): Order['status'] {
  if (status === 'Poslato') return 'Poslata';
  if (status === 'Isporučeno') return 'Isporučena';
  return status as Order['status'];
}

export function migrateStoreDatabase(rawInput: unknown): FullStoreDatabase {
  const raw = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Partial<FullStoreDatabase>;

  const rawProducts = Array.isArray(raw.products) ? raw.products : SEED_PRODUCTS;
  const products: AdminProduct[] = rawProducts.map((p) => syncProductStockFields(p as AdminProduct));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const rawOrders = Array.isArray(raw.orders) ? raw.orders : SEED_ORDERS;
  const orders: Order[] = rawOrders.map((o) => {
    const status = migrateLegacyStatus(String(o.status || 'Nova'));
    const prod = productMap.get(o.productId);
    const items =
      o.items && o.items.length > 0
        ? o.items
        : [
            {
              productId: o.productId,
              sku: prod?.sku,
              title: o.productTitle,
              imageUrl: o.productImage,
              size: o.selectedSize,
              color: prod?.color,
              quantity: o.bundleQuantity,
              unitSalePrice: o.pricing.unitSalePrice,
              unitOriginalPrice: prod?.originalPrice ?? o.pricing.unitSalePrice,
              unitPurchasePrice: prod?.purchasePrice ?? null,
              returnedQty: 0,
              damagedReturnedQty: 0,
            },
          ];

    return {
      ...o,
      status,
      source: o.source || 'Internet prodavnica',
      items,
      stockState:
        o.stockState ||
        (status === 'Otkazano' || status === 'Vraćena' ? 'released' : 'deducted'),
      statusHistory:
        o.statusHistory && o.statusHistory.length > 0
          ? o.statusHistory
          : [{ status, at: o.createdAt, actor: 'sistem' }],
      shipping: o.shipping || {
        courier: o.pickupInPerson ? 'Lično preuzimanje' : 'Post Express',
        chargedToCustomer: o.pricing.shippingCost,
        actualCost: o.pickupInPerson ? 0 : 450,
        returnCost: 0,
      },
      cod: o.cod || {
        expectedAmount: o.pricing.total,
        collectedFromCustomer: status === 'Isporučena',
        settledToSeller: status === 'Isporučena',
        courierFee: 0,
        receivedAmount: status === 'Isporučena' ? o.pricing.total : 0,
      },
    };
  });

  // Backfill CRM customers from existing orders if empty
  let customers: CustomerRecord[] = Array.isArray(raw.customers) ? raw.customers : [];
  if (customers.length === 0 && orders.length > 0) {
    const byPhone = new Map<string, CustomerRecord>();
    for (const o of orders) {
      const norm = normalizeSerbianPhoneDigits(o.customer.phone);
      const existing = byPhone.get(norm);
      const isDelivered = o.status === 'Isporučena';
      const isReturned = o.status === 'Vraćena' || o.status === 'Neuspešna dostava';
      if (existing) {
        existing.ordersCount += 1;
        if (isDelivered) existing.deliveredCount += 1;
        if (isReturned) existing.uncollectedCount += 1;
        if (o.status !== 'Otkazano' && o.status !== 'Vraćena') {
          existing.totalSpentRsd += o.pricing.total;
        }
        if (o.createdAt > existing.lastOrderAt) existing.lastOrderAt = o.createdAt;
      } else {
        byPhone.set(norm, {
          id: `cust-${norm || Date.now()}`,
          fullName: o.customer.fullName,
          phone: o.customer.phone,
          normalizedPhone: norm,
          street: o.customer.street,
          cityZip: o.customer.cityZip,
          ordersCount: 1,
          deliveredCount: isDelivered ? 1 : 0,
          uncollectedCount: isReturned ? 1 : 0,
          returnedCount: o.status === 'Vraćena' ? 1 : 0,
          totalSpentRsd: o.status !== 'Otkazano' && o.status !== 'Vraćena' ? o.pricing.total : 0,
          lastOrderAt: o.createdAt,
          createdAt: o.createdAt,
        });
      }
    }
    customers = Array.from(byPhone.values());
  }

  const reviews: ReviewItem[] =
    Array.isArray(raw.reviews) && raw.reviews.length > 0
      ? raw.reviews
      : CUSTOMER_REVIEWS.map((r) => ({
          ...r,
          rating: 5,
          verifiedPurchase: true,
          status: 'approved',
        }));

  const mergedSettings = {
    ...DEFAULT_STORE_SETTINGS,
    ...(raw.settings || {}),
  };

  if (mergedSettings.brandName === 'ATELIER OUTLET') {
    mergedSettings.brandName = DEFAULT_STORE_SETTINGS.brandName;
  }
  if (mergedSettings.brandSubtitle === 'LIKVIDACIJA ZALIHA') {
    mergedSettings.brandSubtitle = DEFAULT_STORE_SETTINGS.brandSubtitle;
  }
  if (!mergedSettings.secondarySlogan) {
    mergedSettings.secondarySlogan = DEFAULT_STORE_SETTINGS.secondarySlogan;
  }
  if (!mergedSettings.logoMonogram) {
    mergedSettings.logoMonogram = DEFAULT_STORE_SETTINGS.logoMonogram;
  }
  if (mergedSettings.heroTitle === 'Velika Rasprodaja Butik Zaliha') {
    mergedSettings.heroTitle = DEFAULT_STORE_SETTINGS.heroTitle;
  }
  if (
    mergedSettings.contactPhoneDisplay === '064 892 3104' ||
    !mergedSettings.contactPhoneDisplay
  ) {
    mergedSettings.contactPhoneDisplay = DEFAULT_STORE_SETTINGS.contactPhoneDisplay;
  }
  if (
    mergedSettings.contactViberNumber === '+381648923104' ||
    !mergedSettings.contactViberNumber
  ) {
    mergedSettings.contactViberNumber = DEFAULT_STORE_SETTINGS.contactViberNumber;
  }
  if (mergedSettings.contactEmail === 'podrska@atelieroutlet.rs') {
    mergedSettings.contactEmail = DEFAULT_STORE_SETTINGS.contactEmail;
  }

  const migratedLegalPages =
    Array.isArray(raw.legalPages) && raw.legalPages.length > 0
      ? raw.legalPages.map((page) => {
          if (
            (page.slug === 'o-nama' || page.slug === 'kontakt') &&
            (page.content.includes('ATELIER OUTLET') || page.content.includes('064 892 3104'))
          ) {
            return DEFAULT_LEGAL_PAGES.find((d) => d.slug === page.slug) || page;
          }
          return page;
        })
      : DEFAULT_LEGAL_PAGES;

  return {
    schemaVersion: 2,
    products,
    orders,
    customers,
    stockMovements: Array.isArray(raw.stockMovements) ? raw.stockMovements : [],
    priceHistory: Array.isArray(raw.priceHistory) ? raw.priceHistory : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    promotions: Array.isArray(raw.promotions) ? raw.promotions : [],
    coupons: Array.isArray(raw.coupons) ? raw.coupons : [],
    reviews,
    restockSubscriptions: Array.isArray(raw.restockSubscriptions) ? raw.restockSubscriptions : [],
    categories:
      Array.isArray(raw.categories) && raw.categories.length > 0
        ? raw.categories
        : buildDefaultCategories(),
    legalPages: migratedLegalPages,
    settings: mergedSettings,
    adminUsers: Array.isArray(raw.adminUsers) ? raw.adminUsers : [],
    idempotencyMap:
      raw.idempotencyMap && typeof raw.idempotencyMap === 'object' ? raw.idempotencyMap : {},
  };
}

export function createStoreEngine(storeFilePath: string) {
  const dataDir = path.dirname(storeFilePath);
  const backupsDir = path.join(dataDir, 'backups');
  let queue: Promise<void> = Promise.resolve();

  function ensureDirs() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  }

  function writeAtomic(db: FullStoreDatabase): void {
    ensureDirs();
    const tmp = `${storeFilePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmp, storeFilePath);
  }

  function ensureInitialized(): FullStoreDatabase {
    ensureDirs();
    if (!fs.existsSync(storeFilePath)) {
      const initial = migrateStoreDatabase({
        products: SEED_PRODUCTS,
        orders: SEED_ORDERS,
      });
      writeAtomic(initial);
      return initial;
    }

    const rawText = fs.readFileSync(storeFilePath, 'utf-8');
    const parsed = JSON.parse(rawText) as Partial<FullStoreDatabase>;
    if ((parsed.schemaVersion ?? 0) < 2) {
      // Save pre-migration backup once
      const migBackup = path.join(backupsDir, `migration-v1-to-v2-${Date.now()}.json`);
      fs.writeFileSync(migBackup, rawText, 'utf-8');
      const migrated = migrateStoreDatabase(parsed);
      writeAtomic(migrated);
      return migrated;
    }
    return migrateStoreDatabase(parsed);
  }

  function readDb(): FullStoreDatabase {
    return ensureInitialized();
  }

  async function withDbTransaction<T>(
    mutator: (db: FullStoreDatabase) => Promise<T> | T,
  ): Promise<T> {
    let release!: () => void;
    const prev = queue;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      const db = ensureInitialized();
      const result = await mutator(db);
      writeAtomic(db);
      return result;
    } finally {
      release();
    }
  }

  function createBackupSnapshot(label = 'manual'): {
    fileName: string;
    createdAt: string;
    sizeBytes: number;
  } {
    ensureDirs();
    const db = ensureInitialized();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `backup-${safeLabel}-${stamp}.json`;
    const targetPath = path.join(backupsDir, fileName);
    const payload = JSON.stringify(db, null, 2);
    fs.writeFileSync(targetPath, payload, 'utf-8');

    // Prune older backups beyond 20 files
    const allFiles = fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    for (const oldFile of allFiles.slice(20)) {
      try {
        fs.unlinkSync(path.join(backupsDir, oldFile));
      } catch {
        // ignore prune failure
      }
    }

    return {
      fileName,
      createdAt: new Date().toISOString(),
      sizeBytes: Buffer.byteLength(payload, 'utf-8'),
    };
  }

  function listBackups(): { fileName: string; sizeBytes: number; createdAt: string }[] {
    ensureDirs();
    return fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith('.json'))
      .map((fileName) => {
        const stat = fs.statSync(path.join(backupsDir, fileName));
        return {
          fileName,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function readBackupFile(fileName: string): FullStoreDatabase | null {
    const base = path.basename(fileName);
    const resolved = path.resolve(backupsDir, base);
    if (!resolved.startsWith(backupsDir + path.sep) || !fs.existsSync(resolved)) {
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    return migrateStoreDatabase(raw);
  }

  return {
    readDb,
    withDbTransaction,
    createBackupSnapshot,
    listBackups,
    readBackupFile,
  };
}
