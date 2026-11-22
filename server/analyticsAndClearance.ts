import type {
  AdminAlert,
  AdminProduct,
  PriceChangeBatch,
} from '../src/types/store';
import {
  applyClearanceRollbackToProducts,
  computeFinancialSummary,
  previewClearanceMarkdown,
} from '../src/utils/financeLogic';
import { getTotalStock, isProductPubliclyActive } from '../src/utils/storeLogic';
import { syncProductStockFields } from './db';
import { DomainError } from './inventoryAndOrders';
import type { FullStoreDatabase } from './types';

export function analyzeClearanceCandidates(
  products: AdminProduct[],
  stagnantDaysThreshold = 7,
  now: Date = new Date(),
) {
  const cutoffMs = now.getTime() - stagnantDaysThreshold * 24 * 60 * 60 * 1000;

  const lastPieceItems: AdminProduct[] = [];
  const stagnantItems: AdminProduct[] = [];
  const overstockItems: AdminProduct[] = [];

  for (const p of products) {
    if (!isProductPubliclyActive(p)) continue;
    const total = getTotalStock(p.stockBySize, p.variants);
    if (total <= 0) continue;

    if (total === 1) lastPieceItems.push(p);
    if (total >= 8) overstockItems.push(p);

    const refTime = new Date(p.createdAt).getTime();
    if (refTime <= cutoffMs && (p.soldCount ?? 0) === 0) {
      stagnantItems.push(p);
    }
  }

  return {
    lastPieceItems,
    stagnantItems,
    overstockItems,
  };
}

export function applyClearanceBatchInDb(
  db: FullStoreDatabase,
  params: {
    label: string;
    targetProductIds: string[];
    mode: 'percent' | 'fixed_rsd';
    value: number;
    roundToEnding90?: boolean;
    actor: string;
  },
): { batch: PriceChangeBatch; updatedProducts: AdminProduct[] } {
  const preview = previewClearanceMarkdown({
    products: db.products,
    targetProductIds: params.targetProductIds,
    mode: params.mode,
    value: params.value,
    roundToEnding90: params.roundToEnding90,
  });

  if (preview.length === 0) {
    throw new DomainError(400, 'Nijedan artikal nije izabran za sniženje.');
  }

  const nowIso = new Date().toISOString();
  const entries: PriceChangeBatch['entries'] = [];
  const updatedProducts: AdminProduct[] = [];

  for (const row of preview) {
    const idx = db.products.findIndex((p) => p.id === row.productId);
    if (idx === -1) continue;
    const prevPrice = db.products[idx].salePrice;
    if (prevPrice === row.proposedSalePrice) continue;

    entries.push({
      productId: row.productId,
      productTitle: row.productTitle,
      previousSalePrice: prevPrice,
      newSalePrice: row.proposedSalePrice,
    });

    db.products[idx] = syncProductStockFields({
      ...db.products[idx],
      salePrice: row.proposedSalePrice,
      updatedAt: nowIso,
    });
    updatedProducts.push(db.products[idx]);
  }

  if (entries.length === 0) {
    throw new DomainError(400, 'Nema promena cena za izabrane artikle.');
  }

  const batch: PriceChangeBatch = {
    id: `clr-${Date.now().toString(36)}`,
    label: params.label.trim() || 'Akcijsko sniženje zaliha',
    ruleSummary:
      params.mode === 'percent'
        ? `-${params.value}%${params.roundToEnding90 ? ' (zaokruženo na .90)' : ''}`
        : `-${params.value} RSD`,
    appliedAt: nowIso,
    actor: params.actor,
    entries,
  };

  db.priceHistory.unshift(batch);
  return { batch, updatedProducts };
}

export function rollbackClearanceBatchInDb(
  db: FullStoreDatabase,
  batchId: string,
): { batch: PriceChangeBatch; updatedProducts: AdminProduct[] } {
  const batch = db.priceHistory.find((b) => b.id === batchId);
  if (!batch) {
    throw new DomainError(404, 'Izmena cena nije pronađena.');
  }
  if (batch.rolledBackAt) {
    throw new DomainError(400, 'Ova promena cena je već vraćena na prethodno stanje.');
  }

  const affectedIds = new Set(batch.entries.map((e) => e.productId));
  db.products = applyClearanceRollbackToProducts(db.products, batch).map(syncProductStockFields);
  batch.rolledBackAt = new Date().toISOString();

  return {
    batch,
    updatedProducts: db.products.filter((p) => affectedIds.has(p.id)),
  };
}

export function computeSalesStatistics(
  db: FullStoreDatabase,
  fromIso?: string,
  toIso?: string,
) {
  const fromMs = fromIso ? new Date(fromIso).getTime() : null;
  const toMs = toIso ? new Date(toIso).getTime() : null;

  const orders = db.orders.filter((o) => {
    const ms = new Date(o.createdAt).getTime();
    if (fromMs !== null && ms < fromMs) return false;
    if (toMs !== null && ms > toMs) return false;
    return true;
  });

  const nonCanceled = orders.filter(
    (o) => o.status !== 'Otkazano' && o.status !== 'Vraćena',
  );
  const delivered = orders.filter((o) => o.status === 'Isporučena');
  const canceledOrReturned = orders.filter(
    (o) => o.status === 'Otkazano' || o.status === 'Vraćena',
  );

  const totalRevenueRsd = nonCanceled.reduce((s, o) => s + o.pricing.total, 0);
  const aovRsd = nonCanceled.length > 0 ? Math.round(totalRevenueRsd / nonCanceled.length) : 0;
  const returnRatePercent =
    orders.length > 0
      ? Math.round((canceledOrReturned.length / orders.length) * 1000) / 10
      : 0;

  const productMap = new Map(db.products.map((p) => [p.id, p]));
  const byCategory: Record<string, { revenue: number; pieces: number }> = {};
  const bySize: Record<string, number> = {};
  const bySource: Record<string, { orders: number; revenue: number }> = {};
  const byProduct: Record<string, { id: string; title: string; pieces: number; revenue: number }> = {};
  const dailySeriesMap = new Map<string, { date: string; revenue: number; orders: number }>();

  for (const o of nonCanceled) {
    const src = o.source || 'Internet prodavnica';
    if (!bySource[src]) bySource[src] = { orders: 0, revenue: 0 };
    bySource[src].orders += 1;
    bySource[src].revenue += o.pricing.total;

    const dayKey = o.createdAt.slice(0, 10);
    const dayEntry = dailySeriesMap.get(dayKey) || { date: dayKey, revenue: 0, orders: 0 };
    dayEntry.revenue += o.pricing.total;
    dayEntry.orders += 1;
    dailySeriesMap.set(dayKey, dayEntry);

    for (const line of o.items ?? []) {
      const prod = productMap.get(line.productId);
      const cat = prod?.category || 'Ostalo';
      if (!byCategory[cat]) byCategory[cat] = { revenue: 0, pieces: 0 };
      const lineRev = line.unitSalePrice * line.quantity;
      byCategory[cat].revenue += lineRev;
      byCategory[cat].pieces += line.quantity;

      bySize[line.size] = (bySize[line.size] ?? 0) + line.quantity;

      if (!byProduct[line.productId]) {
        byProduct[line.productId] = {
          id: line.productId,
          title: line.title,
          pieces: 0,
          revenue: 0,
        };
      }
      byProduct[line.productId].pieces += line.quantity;
      byProduct[line.productId].revenue += lineRev;
    }
  }

  const topProducts = Object.values(byProduct)
    .sort((a, b) => b.pieces - a.pieces)
    .slice(0, 8);

  const zeroSaleProducts = db.products
    .filter((p) => isProductPubliclyActive(p) && getTotalStock(p.stockBySize, p.variants) > 0)
    .filter((p) => !byProduct[p.id])
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      stock: getTotalStock(p.stockBySize, p.variants),
      salePrice: p.salePrice,
    }));

  const dailySeries = Array.from(dailySeriesMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return {
    ordersCount: orders.length,
    activeOrdersCount: nonCanceled.length,
    deliveredCount: delivered.length,
    canceledOrReturnedCount: canceledOrReturned.length,
    totalRevenueRsd,
    aovRsd,
    returnRatePercent,
    byCategory,
    bySize,
    bySource,
    topProducts,
    zeroSaleProducts,
    dailySeries,
  };
}

export function computeAdminAlerts(db: FullStoreDatabase, now: Date = new Date()): AdminAlert[] {
  const alerts: AdminAlert[] = [];

  const newOrdersCount = db.orders.filter(
    (o) => o.status === 'Nova' || o.status === 'Čeka potvrdu',
  ).length;
  if (newOrdersCount > 0) {
    alerts.push({
      id: 'alert-new-orders',
      severity: 'high',
      title: `${newOrdersCount} novih porudžbina čeka obradu`,
      description: 'Proverite i potvrdite porudžbine radi blagovremenog slanja.',
      targetTab: 'orders',
      count: newOrdersCount,
    });
  }

  const lastPieceCount = db.products.filter(
    (p) => isProductPubliclyActive(p) && getTotalStock(p.stockBySize, p.variants) === 1,
  ).length;
  if (lastPieceCount > 0) {
    alerts.push({
      id: 'alert-last-piece',
      severity: 'info',
      title: `${lastPieceCount} artikala na poslednjem komadu`,
      description: 'Idealno za brzu rasprodaju kroz „Poslednji komad“ promociju.',
      targetTab: 'clearance',
      count: lastPieceCount,
    });
  }

  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const overdueShipments = db.orders.filter((o) => {
    if (o.status !== 'Spakovana' && o.status !== 'Poslata' && o.status !== 'U dostavi') return false;
    return now.getTime() - new Date(o.createdAt).getTime() > threeDaysMs;
  }).length;
  if (overdueShipments > 0) {
    alerts.push({
      id: 'alert-overdue-shipments',
      severity: 'medium',
      title: `${overdueShipments} pošiljki na čekanju duže od 3 dana`,
      description: 'Proverite status isporuke kod kurirske službe.',
      targetTab: 'shipping',
      count: overdueShipments,
    });
  }

  const fin = computeFinancialSummary(db.orders, db.products, db.expenses);
  if (fin.codAwaitingOrdersCount > 0) {
    alerts.push({
      id: 'alert-cod-awaiting',
      severity: 'medium',
      title: `${fin.codAwaitingOrdersCount} isporučenih otkupa čeka uplatu kurira`,
      description: `Iznos kod kurira za rasknjižavanje: ${fin.codAwaitingSettlementRsd.toLocaleString('sr-RS')} RSD.`,
      targetTab: 'shipping',
      count: fin.codAwaitingOrdersCount,
    });
  }

  if (fin.productsMissingPurchasePriceCount > 0) {
    alerts.push({
      id: 'alert-missing-cogs',
      severity: 'info',
      title: `${fin.productsMissingPurchasePriceCount} artikala nema unetu nabavnu cenu`,
      description: 'Za tačan proračun marže dopunite nabavnu cenu u uređivanju artikala.',
      targetTab: 'finances',
      count: fin.productsMissingPurchasePriceCount,
    });
  }

  const missingLegalFields: string[] = [];
  if (!db.settings.legalCompanyName.trim()) missingLegalFields.push('Pravni naziv firme');
  if (!db.settings.legalPib.trim()) missingLegalFields.push('PIB');
  if (!db.settings.legalMb.trim()) missingLegalFields.push('Matični broj');
  if (!db.settings.legalSeatAddress.trim()) missingLegalFields.push('Sedište');

  if (missingLegalFields.length > 0) {
    alerts.push({
      id: 'alert-legal-incomplete',
      severity: 'medium',
      title: 'Pravni podaci firme čekaju unos vlasnika',
      description: `Nedostaje pre javnog puštanja u rad: ${missingLegalFields.join(', ')}.`,
      targetTab: 'settings',
      count: missingLegalFields.length,
    });
  }

  return alerts;
}
