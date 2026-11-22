import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  GitMerge,
  Search,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { CustomerRecord, Order } from '../../types/store';
import {
  downloadAdminCsvApi,
  mergeCustomersApi,
  settleCodOrdersApi,
  updateCustomerApi,
} from '../../utils/api';
import { formatRsd, normalizeSerbianLatin } from '../../utils/storeLogic';

interface CustomersAndShippingTabProps {
  mode: 'customers' | 'shipping';
  customers: CustomerRecord[];
  orders: Order[];
  onDataChanged: () => void;
}

export function CustomersAndShippingTab({
  mode,
  customers,
  orders,
  onDataChanged,
}: CustomersAndShippingTabProps) {
  const [search, setSearch] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [mergePrimaryId, setMergePrimaryId] = useState('');
  const [mergeDuplicateId, setMergeDuplicateId] = useState('');

  // COD Reconciliation state
  const [selectedCodIds, setSelectedCodIds] = useState<string[]>([]);
  const [courierFeeTotal, setCourierFeeTotal] = useState('0');
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const filteredCustomers = useMemo(() => {
    const q = normalizeSerbianLatin(search);
    return customers.filter((c) => {
      if (!q) return true;
      return normalizeSerbianLatin(`${c.fullName} ${c.phone} ${c.cityZip}`).includes(q);
    });
  }, [customers, search]);

  const codAwaiting = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'Isporučena' &&
          !o.pickupInPerson &&
          !o.cod?.settledToSeller,
      ),
    [orders],
  );

  const codSettled = useMemo(
    () =>
      orders.filter(
        (o) => o.status === 'Isporučena' && o.cod?.settledToSeller,
      ),
    [orders],
  );

  const readyToShip = useMemo(
    () =>
      orders.filter((o) =>
        ['Nova', 'Potvrđena', 'U obradi', 'Spakovana'].includes(o.status),
      ),
    [orders],
  );

  const handleSettleCod = async () => {
    if (selectedCodIds.length === 0) return;
    setFeedback(null);
    const feePerOrder = Math.round(
      (Number(courierFeeTotal) || 0) / selectedCodIds.length,
    );
    try {
      const settlements = selectedCodIds.map((id) => {
        const ord = codAwaiting.find((o) => o.id === id);
        return {
          orderId: id,
          receivedAmount: ord?.cod?.expectedAmount ?? ord?.pricing.total ?? 0,
          courierFee: feePerOrder,
          discrepancyNote: discrepancyNote.trim() || undefined,
        };
      });
      await settleCodOrdersApi(settlements);
      setFeedback({
        type: 'success',
        message: `Rasknjižen otkup za ${selectedCodIds.length} isporučenih pošiljki.`,
      });
      setSelectedCodIds([]);
      setCourierFeeTotal('0');
      setDiscrepancyNote('');
      onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri rasknjižavanju otkupa.',
      });
    }
  };

  if (mode === 'shipping') {
    const awaitingTotal = codAwaiting.reduce(
      (s, o) => s + (o.cod?.expectedAmount ?? o.pricing.total),
      0,
    );
    const selectedTotal = codAwaiting
      .filter((o) => selectedCodIds.includes(o.id))
      .reduce((s, o) => s + (o.cod?.expectedAmount ?? o.pricing.total), 0);

    return (
      <div className="space-y-5">
        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border border-rose-200 text-[#9F1239]'
            }`}
          >
            {feedback.type === 'success' && <Check className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Courier CSV Export Card */}
        <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#9F1239]" />
              <span>Pakovanje i izvoz za kurirsku službu</span>
            </h2>
            <p className="text-xs text-[#6B6862] mt-0.5 tabular-nums">
              Spremno za slanje: <strong>{readyToShip.length}</strong> pošiljki · Izvoz sadrži
              ime, adresu, telefon, otkupninu i napomenu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void downloadAdminCsvApi('courier')}
            className="h-10 px-4 rounded-xl bg-[#121212] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Izvezi Post Express CSV</span>
          </button>
        </section>

        {/* COD Money at Courier ("Novac kod kurira") */}
        <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-editorial text-lg font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#C5A059]" />
                <span>Novac kod kurira (otkupnine na čekanju)</span>
              </h3>
              <p className="text-xs text-[#6B6862]">
                Isporučeni paketi za koje novac od Post Expressa još nije legao na račun.
              </p>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-[11px] text-[#6B6862]">Čeka uplatu:</p>
              <p className="text-lg font-bold text-[#9F1239]">{formatRsd(awaitingTotal)}</p>
            </div>
          </div>

          {codAwaiting.length === 0 ? (
            <p className="p-4 rounded-xl bg-[#FAF9F6] text-xs text-[#6B6862]">
              Sve isporučene pošiljke su rasknjižene.
            </p>
          ) : (
            <div className="space-y-2">
              {codAwaiting.map((ord) => {
                const checked = selectedCodIds.includes(ord.id);
                return (
                  <label
                    key={ord.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer ${
                      checked
                        ? 'bg-[#FAF9F6] border-[#121212]'
                        : 'bg-white border-[#E6E2D8]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedCodIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== ord.id)
                              : [...prev, ord.id],
                          )
                        }
                        className="w-4 h-4 accent-[#9F1239]"
                      />
                      <div>
                        <span className="font-bold tabular-nums">{ord.id}</span> ·{' '}
                        <span>{ord.customer.fullName}</span>
                        <p className="text-[11px] text-[#6B6862]">
                          {ord.customer.cityZip} · Kurir: {ord.shipping?.courier || 'Post Express'}
                        </p>
                      </div>
                    </div>
                    <strong className="tabular-nums text-[#121212]">
                      {formatRsd(ord.cod?.expectedAmount ?? ord.pricing.total)}
                    </strong>
                  </label>
                );
              })}

              {selectedCodIds.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#121212] text-white space-y-3 text-xs">
                  <div className="flex items-center justify-between tabular-nums">
                    <span>Izabrano ({selectedCodIds.length} paketa):</span>
                    <strong className="text-[#C5A059]">{formatRsd(selectedTotal)}</strong>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={courierFeeTotal}
                      onChange={(e) => setCourierFeeTotal(e.target.value)}
                      placeholder="Provizija kurira (RSD ukupno)"
                      className="h-9 px-2.5 rounded-lg bg-white text-[#121212] text-xs"
                    />
                    <input
                      type="text"
                      value={discrepancyNote}
                      onChange={(e) => setDiscrepancyNote(e.target.value)}
                      placeholder="Napomena / odstupanje (opciono)"
                      className="h-9 px-2.5 rounded-lg bg-white text-[#121212] text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSettleCod()}
                    className="w-full h-10 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white font-semibold cursor-pointer"
                  >
                    Označi kao rasknjiženo i uplaćeno
                  </button>
                </div>
              )}
            </div>
          )}

          {codSettled.length > 0 && (
            <div className="pt-3 border-t border-[#F0ECE3] text-xs text-[#6B6862]">
              <strong className="text-[#121212]">
                Rasknjiženo poslednjih pošiljki: {codSettled.length}
              </strong>{' '}
              · Ukupno primljeno:{' '}
              {formatRsd(
                codSettled.reduce((s, o) => s + (o.cod?.receivedAmount ?? o.pricing.total), 0),
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E6E2D8] rounded-2xl p-3.5 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#6B6862] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži kupce po imenu, telefonu, gradu..."
            className="w-full h-10 pl-9 pr-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => void downloadAdminCsvApi('customers')}
          className="h-10 px-3.5 rounded-xl border border-[#D8D2C5] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Izvezi kupce CSV</span>
        </button>
      </div>

      {/* Duplicate Customer Merge Tool */}
      {customers.length >= 2 && (
        <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-2.5 text-xs">
          <p className="font-semibold flex items-center gap-1.5">
            <GitMerge className="w-4 h-4 text-[#9F1239]" />
            <span>Spajanje dupliranih profila kupaca</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={mergePrimaryId}
              onChange={(e) => setMergePrimaryId(e.target.value)}
              className="h-9 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
            >
              <option value="">Glavni profil...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.phone})
                </option>
              ))}
            </select>
            <select
              value={mergeDuplicateId}
              onChange={(e) => setMergeDuplicateId(e.target.value)}
              className="h-9 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
            >
              <option value="">Duplikat za spajanje...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.phone})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!mergePrimaryId || !mergeDuplicateId || mergePrimaryId === mergeDuplicateId}
              onClick={async () => {
                await mergeCustomersApi(mergePrimaryId, mergeDuplicateId);
                setMergePrimaryId('');
                setMergeDuplicateId('');
                setFeedback({ type: 'success', message: 'Profili kupca su spojeni.' });
                onDataChanged();
              }}
              className="h-9 rounded-lg bg-[#121212] disabled:opacity-40 text-white font-semibold cursor-pointer"
            >
              Spoji profile
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
          {feedback.message}
        </div>
      )}

      <div className="space-y-2.5">
        {filteredCustomers.map((c) => (
          <div
            key={c.id}
            className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-2 text-xs"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#6B6862]" />
                  <strong className="text-sm text-[#121212]">{c.fullName}</strong>
                  {c.uncollectedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[#9F1239] text-[10px] font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      Nepreuzeto: {c.uncollectedCount}
                    </span>
                  )}
                </div>
                <p className="text-[#6B6862] mt-0.5">
                  {c.street}, {c.cityZip} · Tel: <strong className="tabular-nums">{c.phone}</strong>
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className="font-bold text-[#121212]">{formatRsd(c.totalSpentRsd)}</p>
                <p className="text-[11px] text-[#6B6862]">
                  Porudžbina: {c.ordersCount} · Isporučeno: {c.deliveredCount}
                </p>
              </div>
            </div>

            {editingNoteId === c.id ? (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Interna beleška o kupcu..."
                  className="flex-1 h-9 px-2.5 rounded-lg border border-[#D8D2C5] text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await updateCustomerApi(c.id, { internalNote: noteText });
                    setEditingNoteId(null);
                    onDataChanged();
                  }}
                  className="h-9 px-3 rounded-lg bg-[#121212] text-white font-semibold cursor-pointer"
                >
                  Sačuvaj
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-[#6B6862]">
                <span>{c.internalNote ? `Napomena: ${c.internalNote}` : 'Bez interne napomene'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNoteId(c.id);
                    setNoteText(c.internalNote || '');
                  }}
                  className="text-[#9F1239] font-semibold hover:underline cursor-pointer"
                >
                  Izmeni napomenu
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
