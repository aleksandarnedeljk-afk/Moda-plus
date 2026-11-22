import type { AdminProduct, ExpenseRecord, Order, PriceChangeBatch } from '../types/store';
import { getTotalStock } from './storeLogic';

export interface FinancialSummary {
  realizedDeliveredRevenueRsd: number;
  pipelineActiveRevenueRsd: number;
  canceledAndReturnedGrossRsd: number;
  refundsTotalRsd: number;
  netRealizedSalesRsd: number;
  realizedCogsRsd: number;
  itemsMissingPurchasePriceCount: number;
  productsMissingPurchasePriceCount: number;
  grossMarginRsd: number;
  grossMarginPercent: number | null;
  shippingChargedToCustomersRsd: number;
  actualShippingCostsRsd: number;
  returnShippingCostsRsd: number;
  courierFeesRsd: number;
  operatingExpensesRsd: number;
  netProfitAfterDirectCostsRsd: number;
  // COD "Novac kod kurira"
  codTotalDeliveredExpectedRsd: number;
  codAwaitingSettlementRsd: number;
  codSettledReceivedRsd: number;
  codDiscrepancyRsd: number;
  codAwaitingOrdersCount: number;
}

export function computeFinancialSummary(
  orders: Order[],
  products: AdminProduct[],
  expenses: ExpenseRecord[],
  range?: { fromIso?: string; toIso?: string },
): FinancialSummary {
  const fromMs = range?.fromIso ? new Date(range.fromIso).getTime() : null;
  const toMs = range?.toIso ? new Date(range.toIso).getTime() : null;

  const inRange = (iso: string) => {
    const ms = new Date(iso).getTime();
    if (fromMs !== null && ms < fromMs) return false;
    if (toMs !== null && ms > toMs) return false;
    return true;
  };

  const productMap = new Map(products.map((p) => [p.id, p]));
  const scopedOrders = orders.filter((o) => inRange(o.createdAt));
  const scopedExpenses = expenses.filter((e) => inRange(e.date));

  let realizedDeliveredRevenueRsd = 0;
  let pipelineActiveRevenueRsd = 0;
  let canceledAndReturnedGrossRsd = 0;
  let refundsTotalRsd = 0;
  let realizedCogsRsd = 0;
  let itemsMissingPurchasePriceCount = 0;
  let shippingChargedToCustomersRsd = 0;
  let actualShippingCostsRsd = 0;
  let returnShippingCostsRsd = 0;
  let courierFeesRsd = 0;

  let codTotalDeliveredExpectedRsd = 0;
  let codAwaitingSettlementRsd = 0;
  let codSettledReceivedRsd = 0;
  let codDiscrepancyRsd = 0;
  let codAwaitingOrdersCount = 0;

  const pipelineStatuses = new Set([
    'Nova',
    'Čeka potvrdu',
    'Potvrđena',
    'U obradi',
    'Spakovana',
    'Poslata',
    'U dostavi',
    'Neuspešna dostava',
    'Reklamacija',
  ]);

  for (const o of scopedOrders) {
    const returnsRefund = (o.returns ?? []).reduce((s, r) => s + r.refundAmountRsd, 0);
    const returnsShipping = (o.returns ?? []).reduce((s, r) => s + r.returnShippingCostRsd, 0);
    refundsTotalRsd += returnsRefund;
    returnShippingCostsRsd += returnsShipping + (o.shipping?.returnCost ?? 0);

    if (o.status === 'Otkazano' || o.status === 'Vraćena') {
      canceledAndReturnedGrossRsd += o.pricing.total;
      actualShippingCostsRsd += o.shipping?.actualCost ?? 0;
      continue;
    }

    if (pipelineStatuses.has(o.status)) {
      pipelineActiveRevenueRsd += o.pricing.total;
    }

    if (o.status === 'Isporučena') {
      const goodsSubtotal = Math.max(0, o.pricing.subtotal + (o.pricing.giftWrapCost ?? 0) - returnsRefund);
      realizedDeliveredRevenueRsd += goodsSubtotal;
      shippingChargedToCustomersRsd += o.pricing.shippingCost;
      actualShippingCostsRsd += o.shipping?.actualCost ?? 0;

      // Calculate COGS strictly from real recorded purchasePrice
      const lines =
        o.items && o.items.length > 0
          ? o.items
          : [
              {
                productId: o.productId,
                quantity: o.bundleQuantity,
                unitPurchasePrice: productMap.get(o.productId)?.purchasePrice ?? null,
                returnedQty: 0,
              },
            ];

      for (const line of lines) {
        const netSoldQty = Math.max(0, line.quantity - (line.returnedQty ?? 0));
        if (netSoldQty === 0) continue;
        const unitCost =
          line.unitPurchasePrice != null
            ? line.unitPurchasePrice
            : productMap.get(line.productId)?.purchasePrice;
        if (unitCost != null && Number.isFinite(unitCost) && unitCost >= 0) {
          realizedCogsRsd += Math.round(unitCost * netSoldQty);
        } else {
          itemsMissingPurchasePriceCount += netSoldQty;
        }
      }

      // COD Reconciliation ("Novac kod kurira")
      const codExpected = o.cod?.expectedAmount ?? o.pricing.total;
      codTotalDeliveredExpectedRsd += codExpected;
      if (o.cod?.settledToSeller) {
        const received = o.cod.receivedAmount ?? codExpected;
        const fee = o.cod.courierFee ?? 0;
        codSettledReceivedRsd += received;
        courierFeesRsd += fee;
        codDiscrepancyRsd += codExpected - received - fee;
      } else if (!o.pickupInPerson) {
        codAwaitingSettlementRsd += codExpected;
        codAwaitingOrdersCount += 1;
      }
    }
  }

  const operatingExpensesRsd = scopedExpenses.reduce((s, e) => s + e.amountRsd, 0);
  const netRealizedSalesRsd = realizedDeliveredRevenueRsd;
  const grossMarginRsd = netRealizedSalesRsd - realizedCogsRsd;
  const grossMarginPercent =
    netRealizedSalesRsd > 0 ? Math.round((grossMarginRsd / netRealizedSalesRsd) * 1000) / 10 : null;

  const netShippingDelta = shippingChargedToCustomersRsd - actualShippingCostsRsd - returnShippingCostsRsd;
  const netProfitAfterDirectCostsRsd =
    grossMarginRsd + netShippingDelta - courierFeesRsd - operatingExpensesRsd;

  const productsMissingPurchasePriceCount = products.filter(
    (p) => p.purchasePrice == null || !Number.isFinite(p.purchasePrice),
  ).length;

  return {
    realizedDeliveredRevenueRsd,
    pipelineActiveRevenueRsd,
    canceledAndReturnedGrossRsd,
    refundsTotalRsd,
    netRealizedSalesRsd,
    realizedCogsRsd,
    itemsMissingPurchasePriceCount,
    productsMissingPurchasePriceCount,
    grossMarginRsd,
    grossMarginPercent,
    shippingChargedToCustomersRsd,
    actualShippingCostsRsd,
    returnShippingCostsRsd,
    courierFeesRsd,
    operatingExpensesRsd,
    netProfitAfterDirectCostsRsd,
    codTotalDeliveredExpectedRsd,
    codAwaitingSettlementRsd,
    codSettledReceivedRsd,
    codDiscrepancyRsd,
    codAwaitingOrdersCount,
  };
}

export interface ClearancePreviewRow {
  productId: string;
  productTitle: string;
  category: string;
  currentSalePrice: number;
  proposedSalePrice: number;
  purchasePrice: number | null;
  minAllowedPrice: number | null;
  availableStock: number;
  projectedMarginRsd: number | null;
  warning?: string;
}

export function previewClearanceMarkdown(params: {
  products: AdminProduct[];
  targetProductIds: string[];
  mode: 'percent' | 'fixed_rsd';
  value: number;
  roundToEnding90?: boolean;
}): ClearancePreviewRow[] {
  const targetSet = new Set(params.targetProductIds);
  const rows: ClearancePreviewRow[] = [];

  for (const p of params.products) {
    if (!targetSet.has(p.id)) continue;
    let nextPrice =
      params.mode === 'percent'
        ? Math.round(p.salePrice * (1 - params.value / 100))
        : Math.round(p.salePrice - params.value);

    if (params.roundToEnding90 && nextPrice >= 200) {
      nextPrice = Math.max(90, Math.floor(nextPrice / 100) * 100 + 90);
    } else {
      nextPrice = Math.max(90, nextPrice);
    }

    let warning: string | undefined;
    if (p.purchasePrice != null && nextPrice < p.purchasePrice) {
      warning = `Ispod nabavne cene (${p.purchasePrice} RSD)!`;
    } else if (p.minAllowedPrice != null && nextPrice < p.minAllowedPrice) {
      warning = `Ispod minimalne dozvoljene cene (${p.minAllowedPrice} RSD)!`;
    }

    rows.push({
      productId: p.id,
      productTitle: p.title,
      category: p.category,
      currentSalePrice: p.salePrice,
      proposedSalePrice: nextPrice,
      purchasePrice: p.purchasePrice ?? null,
      minAllowedPrice: p.minAllowedPrice ?? null,
      availableStock: getTotalStock(p.stockBySize, p.variants),
      projectedMarginRsd: p.purchasePrice != null ? nextPrice - p.purchasePrice : null,
      warning,
    });
  }

  return rows;
}

export function applyClearanceRollbackToProducts(
  products: AdminProduct[],
  batch: PriceChangeBatch,
): AdminProduct[] {
  const entryMap = new Map(batch.entries.map((e) => [e.productId, e]));
  return products.map((p) => {
    const entry = entryMap.get(p.id);
    if (!entry) return p;
    return {
      ...p,
      salePrice: entry.previousSalePrice,
      updatedAt: new Date().toISOString(),
    };
  });
}
