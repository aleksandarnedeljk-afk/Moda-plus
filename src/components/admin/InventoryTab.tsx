import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, Search, X } from 'lucide-react';
import type { AdminProduct, ProductSize, StockMovement } from '../../types/store';
import { reconcileInventoryApi } from '../../utils/api';
import { formatRsd, getTotalStock, normalizeSerbianLatin } from '../../utils/storeLogic';

interface InventoryTabProps {
  products: AdminProduct[];
  stockMovements: StockMovement[];
  onInventoryUpdated: () => void;
}

export function InventoryTab({
  products,
  stockMovements,
  onInventoryUpdated,
}: InventoryTabProps) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'low' | 'last1' | 'soldout'>('all');
  const [viewMode, setViewMode] = useState<'stock' | 'movements'>('stock');

  // Reconciliation Modal state
  const [reconcileProduct, setReconcileProduct] = useState<AdminProduct | null>(null);
  const [reconcileReason, setReconcileReason] = useState('Redovna inventura u magacinu');
  const [countsBySize, setCountsBySize] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const openReconcile = (product: AdminProduct) => {
    const map: Record<string, number> = {};
    if (product.variants && product.variants.length > 0) {
      for (const v of product.variants) {
        map[v.size] = v.physicalStock;
      }
    } else {
      for (const [sz, qty] of Object.entries(product.stockBySize)) {
        map[sz] = qty ?? 0;
      }
    }
    setCountsBySize(map);
    setReconcileProduct(product);
    setFeedback(null);
  };

  const handleCommitReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileProduct) return;
    setSaving(true);
    try {
      const adjustments = Object.entries(countsBySize).map(([sz, qty]) => ({
        size: sz as ProductSize,
        newPhysicalStock: Math.max(0, Math.round(Number(qty) || 0)),
      }));
      await reconcileInventoryApi({
        productId: reconcileProduct.id,
        adjustments,
        reason: reconcileReason.trim() || 'Inventura stanja',
      });
      setReconcileProduct(null);
      setFeedback('Stanje magacina je uspešno usklađeno i zabeleženo u evidenciji.');
      onInventoryUpdated();
    } catch {
      setFeedback('Greška pri čuvanju inventure.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = normalizeSerbianLatin(search);
    return products.filter((p) => {
      const avail = getTotalStock(p.stockBySize, p.variants);
      if (filterMode === 'last1' && avail !== 1) return false;
      if (filterMode === 'low' && (avail === 0 || avail > 2)) return false;
      if (filterMode === 'soldout' && avail > 0) return false;
      if (q) {
        const hay = normalizeSerbianLatin(`${p.title} ${p.sku || ''} ${p.category}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, filterMode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 bg-[#EFECE5] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('stock')}
            className={`h-9 px-3.5 rounded-lg text-xs font-semibold cursor-pointer ${
              viewMode === 'stock' ? 'bg-[#121212] text-white' : 'text-[#121212]'
            }`}
          >
            Trenutno stanje &amp; Inventura
          </button>
          <button
            type="button"
            onClick={() => setViewMode('movements')}
            className={`h-9 px-3.5 rounded-lg text-xs font-semibold cursor-pointer ${
              viewMode === 'movements' ? 'bg-[#121212] text-white' : 'text-[#121212]'
            }`}
          >
            Knjiga kretanja zaliha ({stockMovements.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {viewMode === 'stock' ? (
        <>
          <div className="bg-white border border-[#E6E2D8] rounded-2xl p-3.5 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6B6862] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pretraži po nazivu ili SKU..."
                className="w-full h-10 pl-9 pr-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Svi artikli' },
                { id: 'last1', label: 'Poslednji komad (1)' },
                { id: 'low', label: 'Nisko stanje (1–2)' },
                { id: 'soldout', label: 'Rasprodato (0)' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFilterMode(pill.id as typeof filterMode)}
                  className={`h-10 px-3 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                    filterMode === pill.id
                      ? 'bg-[#9F1239] text-white'
                      : 'bg-[#FAF9F6] border border-[#D8D2C5] text-[#121212]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredProducts.map((p) => {
              const variants = p.variants || [];
              const physicalSum = variants.reduce((s, v) => s + v.physicalStock, 0);
              const reservedSum = variants.reduce((s, v) => s + v.reservedStock, 0);
              const soldSum = variants.reduce((s, v) => s + v.soldCount, 0);
              const damagedSum = variants.reduce((s, v) => s + v.damagedCount, 0);
              const availableSum = getTotalStock(p.stockBySize, p.variants);

              return (
                <div
                  key={p.id}
                  className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className="w-14 h-18 object-cover rounded-lg bg-[#F3F2EE] shrink-0"
                      />
                      <div>
                        <p className="text-[11px] text-[#6B6862]">
                          {p.sku || p.id} · {p.category} · {formatRsd(p.salePrice)}
                        </p>
                        <h3 className="text-sm font-semibold text-[#121212]">{p.title}</h3>
                        <div className="flex flex-wrap gap-2 mt-1 text-[11px] tabular-nums">
                          <span>Fizičko: <strong>{physicalSum}</strong></span>
                          <span>Rezervisano: <strong>{reservedSum}</strong></span>
                          <span className={availableSum <= 1 ? 'text-[#9F1239] font-bold' : 'text-emerald-800 font-semibold'}>
                            Dostupno: {availableSum}
                          </span>
                          <span>Prodato: <strong>{soldSum}</strong></span>
                          {damagedSum > 0 && (
                            <span className="text-[#9F1239] font-semibold">
                              Oštećeno: {damagedSum}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openReconcile(p)}
                      className="h-9 px-3 rounded-xl bg-[#121212] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>Inventura / Korekcija</span>
                    </button>
                  </div>

                  {/* Per-variant breakdown */}
                  <div className="flex flex-wrap gap-1.5">
                    {variants.map((v) => {
                      const avail = Math.max(0, v.physicalStock - v.reservedStock);
                      return (
                        <span
                          key={v.id}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] tabular-nums ${
                            avail === 0
                              ? 'bg-[#FAF9F6] border-[#E6E2D8] text-[#6B6862] line-through'
                              : avail === 1
                                ? 'bg-rose-50 border-rose-200 text-[#9F1239] font-semibold'
                                : 'bg-white border-[#D8D2C5] text-[#121212]'
                          }`}
                        >
                          {v.size}: {avail} dost. / {v.physicalStock} fiz.
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white border border-[#E6E2D8] rounded-2xl overflow-hidden">
          <div className="divide-y divide-[#F0ECE3]">
            {stockMovements.slice(0, 120).map((mov) => (
              <div
                key={mov.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#E6E2D8] font-semibold">
                      {mov.type}
                    </span>
                    <strong className="text-[#121212]">{mov.productTitle}</strong>
                    <span className="text-[#6B6862]">({mov.size})</span>
                  </div>
                  <p className="text-[11px] text-[#6B6862] mt-0.5">
                    {mov.reason} · Izvršio: {mov.actor}
                    {mov.orderId ? ` · Porudžbina: ${mov.orderId}` : ''}
                  </p>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <span
                    className={`font-bold ${
                      mov.delta >= 0 ? 'text-emerald-800' : 'text-[#9F1239]'
                    }`}
                  >
                    {mov.delta >= 0 ? `+${mov.delta}` : mov.delta} kom
                  </span>
                  <p className="text-[10px] text-[#6B6862]">
                    Posle: {mov.physicalAfter} fiz. ·{' '}
                    {new Date(mov.createdAt).toLocaleString('sr-RS')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation Modal */}
      {reconcileProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        >
          <div
            className="absolute inset-0"
            onClick={() => setReconcileProduct(null)}
            aria-hidden="true"
          />
          <form
            onSubmit={handleCommitReconcile}
            className="relative w-full max-w-md bg-[#FAF9F6] border border-[#E6E2D8] rounded-2xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-lg font-semibold">
                Inventura: {reconcileProduct.title}
              </h3>
              <button
                type="button"
                onClick={() => setReconcileProduct(null)}
                className="w-8 h-8 rounded-full border border-[#D8D2C5] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Unesite stvarno prebrojano fizičko stanje po veličinama. Svaka korekcija se
                upisuje u knjigu kretanja zaliha.
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.entries(countsBySize).map(([sz, qty]) => (
                <div
                  key={sz}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#E6E2D8]"
                >
                  <span className="text-xs font-semibold">{sz}</span>
                  <input
                    type="number"
                    min={0}
                    value={qty}
                    onChange={(e) =>
                      setCountsBySize((prev) => ({
                        ...prev,
                        [sz]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-24 h-9 px-2.5 rounded-lg border border-[#D8D2C5] text-xs font-bold text-right tabular-nums"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Razlog inventure</label>
              <input
                type="text"
                required
                value={reconcileReason}
                onChange={(e) => setReconcileReason(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white border border-[#D8D2C5] text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-11 rounded-xl bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
            >
              {saving ? 'Čuvanje...' : 'Sačuvaj novo fizičko stanje'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
