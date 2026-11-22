import { useState } from 'react';
import { AlertTriangle, BarChart3, Download, Plus, TrendingUp } from 'lucide-react';
import type { AdminRole, ExpenseRecord } from '../../types/store';
import type { AdminBootstrapData } from '../../utils/api';
import { createExpenseApi, downloadAdminCsvApi } from '../../utils/api';
import { formatRsd } from '../../utils/storeLogic';

interface FinancesAndStatsTabProps {
  userRole: AdminRole;
  financials: AdminBootstrapData['financials'];
  stats: AdminBootstrapData['stats'];
  expenses: ExpenseRecord[];
  fromDate: string;
  toDate: string;
  onDateFilterChange: (from: string, to: string) => void;
  onDataChanged: () => void;
}

export function FinancesAndStatsTab({
  userRole,
  financials,
  stats,
  expenses,
  fromDate,
  toDate,
  onDateFilterChange,
  onDataChanged,
}: FinancesAndStatsTabProps) {
  const [expCategory, setExpCategory] = useState<ExpenseRecord['category']>('Ambalaža');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc.trim() || Number(expAmount) <= 0) return;
    setSavingExpense(true);
    try {
      await createExpenseApi({
        category: expCategory,
        description: expDesc.trim(),
        amountRsd: Number(expAmount),
      });
      setExpDesc('');
      setExpAmount('');
      onDataChanged();
    } finally {
      setSavingExpense(false);
    }
  };

  if (userRole !== 'vlasnik') {
    return (
      <div className="bg-white border border-[#E6E2D8] rounded-2xl p-6 text-center text-xs text-[#6B6862]">
        Detaljni finansijski podaci i marže dostupni su samo vlasniku prodavnice.
      </div>
    );
  }

  const maxDailyRev = Math.max(1, ...stats.dailySeries.map((d) => d.revenue));

  return (
    <div className="space-y-5">
      {/* Date Range & CSV Export */}
      <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2.5 text-xs">
          <div>
            <label className="block text-[10px] font-semibold text-[#6B6862] mb-1">
              Od datuma
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => onDateFilterChange(e.target.value, toDate)}
              className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#6B6862] mb-1">
              Do datuma
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => onDateFilterChange(fromDate, e.target.value)}
              className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => onDateFilterChange('', '')}
              className="h-9 px-3 rounded-lg border border-[#D8D2C5] font-medium cursor-pointer"
            >
              Ceo period
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void downloadAdminCsvApi('finances')}
          className="h-9 px-3.5 rounded-xl bg-[#121212] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Izvezi finansije CSV</span>
        </button>
      </div>

      {/* Warning if items are missing real purchasePrice */}
      {(financials.productsMissingPurchasePriceCount > 0 ||
        financials.itemsMissingPurchasePriceCount > 0) && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Napomena za tačnost marže:</strong>{' '}
            {financials.productsMissingPurchasePriceCount} artikala nema unetu stvarnu nabavnu
            cenu (zato se za njih ne računa fiktivni trošak nabavke). Unesite nabavne cene u
            katalogu da bi neto profit bio 100% potpun.
          </div>
        </div>
      )}

      {/* Financial KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
          <p className="text-[11px] text-[#6B6862]">Realizovana prodaja (Isporučeno)</p>
          <p className="text-lg sm:text-xl font-bold text-[#121212] mt-1 tabular-nums">
            {formatRsd(financials.netRealizedSalesRsd)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
          <p className="text-[11px] text-[#6B6862]">U obradi / Na putu</p>
          <p className="text-lg sm:text-xl font-bold text-amber-800 mt-1 tabular-nums">
            {formatRsd(financials.pipelineActiveRevenueRsd)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
          <p className="text-[11px] text-[#6B6862]">
            Bruto marža ({financials.grossMarginPercent != null ? `${financials.grossMarginPercent}%` : '—'})
          </p>
          <p className="text-lg sm:text-xl font-bold text-emerald-800 mt-1 tabular-nums">
            {formatRsd(financials.grossMarginRsd)}
          </p>
        </div>
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
          <p className="text-[11px] text-[#6B6862]">Neto profit posle troškova</p>
          <p className="text-lg sm:text-xl font-bold text-[#9F1239] mt-1 tabular-nums">
            {formatRsd(financials.netProfitAfterDirectCostsRsd)}
          </p>
        </div>
      </div>

      {/* Cost Breakdown & COD Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-2 text-xs">
          <h3 className="font-editorial text-base font-semibold mb-2">
            Struktura prihoda i direktnih troškova
          </h3>
          <div className="flex justify-between">
            <span>Nabavna vrednost prodate robe (COGS):</span>
            <strong className="tabular-nums">{formatRsd(financials.realizedCogsRsd)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Naplaćena poštarina kupcima:</span>
            <strong className="tabular-nums">
              +{formatRsd(financials.shippingChargedToCustomersRsd)}
            </strong>
          </div>
          <div className="flex justify-between">
            <span>Stvarni trošak poštarina &amp; povraćaja:</span>
            <strong className="tabular-nums text-[#9F1239]">
              -{formatRsd(financials.actualShippingCostsRsd + financials.returnShippingCostsRsd)}
            </strong>
          </div>
          <div className="flex justify-between">
            <span>Kurirske provizije:</span>
            <strong className="tabular-nums text-[#9F1239]">
              -{formatRsd(financials.courierFeesRsd)}
            </strong>
          </div>
          <div className="flex justify-between">
            <span>Operativni troškovi (ambalaža, reklama...):</span>
            <strong className="tabular-nums text-[#9F1239]">
              -{formatRsd(financials.operatingExpensesRsd)}
            </strong>
          </div>
          <div className="pt-2 border-t border-[#F0ECE3] flex justify-between">
            <span>Novac kod kurira (čeka isplatu):</span>
            <strong className="tabular-nums text-[#9F1239]">
              {formatRsd(financials.codAwaitingSettlementRsd)} ({financials.codAwaitingOrdersCount} pak.)
            </strong>
          </div>
        </div>

        {/* Expense Logger */}
        <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3 text-xs">
          <h3 className="font-editorial text-base font-semibold">Evidencija troškova</h3>
          <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as ExpenseRecord['category'])}
              className="h-9 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg sm:col-span-4"
            >
              <option value="Ambalaža">Ambalaža</option>
              <option value="Reklama">Reklama</option>
              <option value="Kurirska provizija">Kurirska provizija</option>
              <option value="Porez / Naknada">Porez / Naknada</option>
              <option value="Zakup / Ostalo">Zakup / Ostalo</option>
            </select>
            <input
              type="text"
              required
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Opis troška"
              className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg sm:col-span-4"
            />
            <input
              type="number"
              required
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="RSD"
              className="h-9 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg sm:col-span-2"
            />
            <button
              type="submit"
              disabled={savingExpense}
              className="h-9 rounded-lg bg-[#121212] text-white font-semibold flex items-center justify-center sm:col-span-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="max-h-36 overflow-y-auto divide-y divide-[#F0ECE3]">
            {expenses.map((exp) => (
              <div key={exp.id} className="py-1.5 flex items-center justify-between">
                <span>
                  <strong>{exp.category}</strong> · {exp.description}
                </span>
                <span className="font-semibold tabular-nums">{formatRsd(exp.amountRsd)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sales Statistics & Charts */}
      <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-editorial text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#9F1239]" />
            <span>Statistika prodaje i analitika</span>
          </h3>
          <div className="flex flex-wrap gap-3 text-xs tabular-nums">
            <span>Prosečna korpa (AOV): <strong>{formatRsd(stats.aovRsd)}</strong></span>
            <span>Stopa otkaza/povraćaja: <strong>{stats.returnRatePercent}%</strong></span>
          </div>
        </div>

        {/* Daily Revenue Bar Chart */}
        {stats.dailySeries.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#6B6862] mb-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Dnevni promet (poslednji dani)
            </p>
            <div className="flex items-end gap-2 h-32 pt-4 px-2 bg-[#FAF9F6] rounded-xl border border-[#E6E2D8] overflow-x-auto">
              {stats.dailySeries.map((day) => {
                const hPct = Math.max(8, Math.round((day.revenue / maxDailyRev) * 100));
                return (
                  <div
                    key={day.date}
                    className="flex flex-col items-center justify-end h-full min-w-[44px] flex-1"
                  >
                    <div
                      title={`${day.date}: ${formatRsd(day.revenue)} (${day.orders} por.)`}
                      style={{ height: `${hPct}%` }}
                      className="w-full max-w-[32px] bg-[#9F1239] rounded-t-md"
                    />
                    <span className="text-[10px] text-[#6B6862] mt-1 tabular-nums">
                      {day.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] space-y-1.5">
            <p className="font-semibold text-[#121212]">Po izvoru porudžbina</p>
            {Object.entries(stats.bySource).map(([src, val]) => (
              <div key={src} className="flex justify-between tabular-nums">
                <span>{src} ({val.orders})</span>
                <strong>{formatRsd(val.revenue)}</strong>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] space-y-1.5">
            <p className="font-semibold text-[#121212]">Najprodavanije veličine</p>
            {Object.entries(stats.bySize).map(([sz, qty]) => (
              <div key={sz} className="flex justify-between tabular-nums">
                <span>Veličina {sz}</span>
                <strong>{qty} kom</strong>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] space-y-1.5">
            <p className="font-semibold text-[#121212]">Artikli bez prodaje na stanju</p>
            {stats.zeroSaleProducts.slice(0, 5).map((zp) => (
              <div key={zp.id} className="flex justify-between gap-2 tabular-nums">
                <span className="truncate">{zp.title}</span>
                <strong className="shrink-0">{zp.stock} kom</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
