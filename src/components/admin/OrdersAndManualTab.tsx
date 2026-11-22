import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import type {
  AdminProduct,
  Order,
  OrderSource,
  OrderStatus,
  ProductSize,
  StoreSettings,
} from '../../types/store';
import {
  bulkOrderStatusApi,
  createManualOrderApi,
  processOrderReturnApi,
  updateOrderStatusApi,
} from '../../utils/api';
import { formatRsd, getTotalStock, normalizeSerbianLatin } from '../../utils/storeLogic';

interface OrdersAndManualTabProps {
  orders: Order[];
  products: AdminProduct[];
  settings: StoreSettings;
  onDataChanged: () => void;
}

const ALL_STATUSES: OrderStatus[] = [
  'Nova',
  'Čeka potvrdu',
  'Potvrđena',
  'U obradi',
  'Spakovana',
  'Poslata',
  'U dostavi',
  'Isporučena',
  'Neuspešna dostava',
  'Vraćena',
  'Otkazano',
  'Reklamacija',
];

const SOURCES: OrderSource[] = [
  'Instagram',
  'Facebook',
  'Viber',
  'Telefon',
  'Lično preuzimanje',
  'Ostalo',
];

export function OrdersAndManualTab({
  orders,
  products,
  settings,
  onDataChanged,
}: OrdersAndManualTabProps) {
  const [statusFilter, setStatusFilter] = useState<'Sve' | OrderStatus>('Sve');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<OrderStatus>('Spakovana');
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Manual Order Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSource, setManualSource] = useState<OrderSource>('Instagram');
  const [manualFullName, setManualFullName] = useState('');
  const [manualStreet, setManualStreet] = useState('');
  const [manualCityZip, setManualCityZip] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualShippingOverride, setManualShippingOverride] = useState('');
  const [manualPickup, setManualPickup] = useState(false);
  const [manualProductId, setManualProductId] = useState(products[0]?.id || '');
  const [manualSize, setManualSize] = useState<ProductSize>('M');
  const [manualQty, setManualQty] = useState(1);
  const [manualSaving, setManualSaving] = useState(false);

  // Return / Damage Modal
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [returnReason, setReturnReason] = useState('Neodgovarajuća veličina / povraćaj');
  const [returnShippingCost, setReturnShippingCost] = useState('450');
  const [returnRefundRsd, setReturnRefundRsd] = useState('');
  const [returnQtys, setReturnQtys] = useState<Record<string, { good: number; damaged: number }>>(
    {},
  );
  const [returnSaving, setReturnSaving] = useState(false);

  // Printable Packing Slip Modal
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  const filteredOrders = useMemo(() => {
    const q = normalizeSerbianLatin(search);
    return orders.filter((o) => {
      if (statusFilter !== 'Sve' && o.status !== statusFilter) return false;
      if (q) {
        const hay = normalizeSerbianLatin(
          `${o.id} ${o.customer.fullName} ${o.customer.phone} ${o.customer.cityZip} ${o.productTitle} ${o.shipping?.trackingNumber || ''}`,
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, search]);

  const handleStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    setFeedback(null);
    try {
      const tracking = trackingInputs[order.id]?.trim();
      await updateOrderStatusApi(order.id, nextStatus, {
        trackingNumber: tracking || order.shipping?.trackingNumber,
      });
      setFeedback({ type: 'success', message: `Porudžbina ${order.id} → ${nextStatus}` });
      onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri promeni statusa.',
      });
    }
  };

  const handleBulkApply = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkOrderStatusApi(selectedIds, bulkTargetStatus);
      setFeedback({
        type: 'success',
        message: `Ažurirano ${selectedIds.length} porudžbina → ${bulkTargetStatus}`,
      });
      setSelectedIds([]);
      onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri grupnoj izmeni.',
      });
    }
  };

  const handleCreateManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualSaving(true);
    setFeedback(null);
    try {
      const res = await createManualOrderApi({
        items: [{ productId: manualProductId, size: manualSize, quantity: manualQty }],
        customer: {
          fullName: manualFullName,
          street: manualPickup ? 'Lično preuzimanje' : manualStreet,
          cityZip: manualPickup ? 'Lično' : manualCityZip,
          phone: manualPhone,
          note: manualNote,
        },
        source: manualSource,
        pickupInPerson: manualPickup,
        shippingOverrideRsd:
          manualShippingOverride.trim() !== '' ? Number(manualShippingOverride) : undefined,
      });
      setShowManualModal(false);
      setManualFullName('');
      setManualStreet('');
      setManualCityZip('');
      setManualPhone('');
      setManualNote('');
      setFeedback({
        type: 'success',
        message: `Ručna porudžbina ${res.order.id} (${manualSource}) kreirana i zalihe skinute!`,
      });
      onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri unosu porudžbine.',
      });
    } finally {
      setManualSaving(false);
    }
  };

  const openReturnModal = (order: Order) => {
    const lines =
      order.items && order.items.length > 0
        ? order.items
        : [
            {
              productId: order.productId,
              size: order.selectedSize,
              quantity: order.bundleQuantity,
              unitSalePrice: order.pricing.unitSalePrice,
            },
          ];
    const init: Record<string, { good: number; damaged: number }> = {};
    for (const l of lines) {
      init[`${l.productId}:${l.size}`] = { good: l.quantity, damaged: 0 };
    }
    setReturnQtys(init);
    setReturnRefundRsd(String(order.pricing.subtotal));
    setReturnOrder(order);
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnOrder) return;
    setReturnSaving(true);
    try {
      const lines =
        returnOrder.items && returnOrder.items.length > 0
          ? returnOrder.items
          : [
              {
                productId: returnOrder.productId,
                size: returnOrder.selectedSize,
                color: undefined,
                quantity: returnOrder.bundleQuantity,
              },
            ];
      const payloadItems = lines.map((l) => {
        const entry = returnQtys[`${l.productId}:${l.size}`] || { good: 0, damaged: 0 };
        return {
          productId: l.productId,
          size: l.size,
          color: l.color,
          returnedQty: entry.good,
          damagedQty: entry.damaged,
        };
      });
      await processOrderReturnApi(returnOrder.id, {
        reason: returnReason,
        refundAmountRsd: Number(returnRefundRsd) || 0,
        returnShippingCostRsd: Number(returnShippingCost) || 0,
        items: payloadItems,
      });
      setReturnOrder(null);
      setFeedback({
        type: 'success',
        message: 'Povraćaj / oštećenje evidentirano — neoštećeni komadi vraćeni u prodaju.',
      });
      onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri obradi povraćaja.',
      });
    } finally {
      setReturnSaving(false);
    }
  };

  const copyViberTemplate = (order: Order) => {
    const text = `Poštovani/a ${order.customer.fullName.split(' ')[0]}, vaša porudžbina ${order.id} (${order.productTitle}) je spremna/poslata.${
      order.shipping?.trackingNumber ? ` Broj pošiljke: ${order.shipping.trackingNumber}.` : ''
    } Iznos pouzećem: ${formatRsd(order.pricing.total)}. Hvala — ${settings.brandName}`;
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setFeedback({ type: 'success', message: `Viber poruka za ${order.id} kopirana.` });
  };

  const activeManualProd = products.find((p) => p.id === manualProductId);
  const activeManualSizes = activeManualProd
    ? Object.entries(activeManualProd.stockBySize)
        .filter(([, q]) => (q ?? 0) > 0)
        .map(([s]) => s)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#6B6862] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po šifri, kupcu, telefonu, praćenju..."
            className="w-full h-10 pl-9 pr-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowManualModal(true)}
          className="h-10 px-4 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nova ručna porudžbina (IG / FB / Viber)</span>
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-[#9F1239]'
          }`}
        >
          {feedback.type === 'success' && <Check className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Status Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {(['Sve', ...ALL_STATUSES] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`h-8 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              statusFilter === st
                ? 'bg-[#121212] text-white'
                : 'bg-white border border-[#E2DDD3] text-[#121212]'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-[#121212] text-white flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>Izabrano porudžbina: {selectedIds.length}</span>
          <div className="flex items-center gap-2">
            <select
              value={bulkTargetStatus}
              onChange={(e) => setBulkTargetStatus(e.target.value as OrderStatus)}
              className="h-8 px-2 rounded-lg bg-white text-[#121212] text-xs font-semibold"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleBulkApply()}
              className="h-8 px-3 rounded-lg bg-[#9F1239] text-white font-semibold cursor-pointer"
            >
              Primeni masovno
            </button>
          </div>
        </div>
      )}

      {/* Orders List */}
      <div className="space-y-3">
        {filteredOrders.map((order) => {
          const checked = selectedIds.includes(order.id);
          return (
            <article
              key={order.id}
              className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#F0ECE3]">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedIds((prev) =>
                        checked ? prev.filter((id) => id !== order.id) : [...prev, order.id],
                      )
                    }
                    className="w-4 h-4 accent-[#9F1239]"
                  />
                  <Package className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
                  <span className="font-bold text-sm text-[#121212] tabular-nums">{order.id}</span>
                  <span className="px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#E6E2D8] text-[10px] font-medium">
                    {order.source || 'Internet prodavnica'}
                  </span>
                  <span className="text-[11px] text-[#6B6862]">
                    {new Date(order.createdAt).toLocaleString('sr-RS')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={order.status}
                    onChange={(e) =>
                      void handleStatusChange(order, e.target.value as OrderStatus)
                    }
                    className="h-8 px-2.5 rounded-full bg-[#FAF9F6] border border-[#121212] text-xs font-semibold cursor-pointer"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                <div className="md:col-span-5 space-y-1">
                  <p className="font-semibold text-[#121212]">{order.customer.fullName}</p>
                  <p className="text-[#6B6862]">
                    {order.customer.street}, {order.customer.cityZip}
                  </p>
                  <p className="font-semibold text-[#121212] tabular-nums">
                    Tel: {order.customer.phone}
                  </p>
                  {order.customer.note && (
                    <p className="text-[11px] italic text-[#9F1239]">
                      Napomena: {order.customer.note}
                    </p>
                  )}
                </div>

                <div className="md:col-span-4 space-y-1">
                  {order.items && order.items.length > 0 ? (
                    order.items.map((line, i) => (
                      <p key={i} className="text-[#121212]">
                        <strong>{line.title}</strong> ({line.size}) × {line.quantity}
                      </p>
                    ))
                  ) : (
                    <p className="text-[#121212]">
                      <strong>{order.productTitle}</strong> ({order.selectedSize}) ×{' '}
                      {order.bundleQuantity}
                    </p>
                  )}
                  <p className="text-sm font-bold text-[#9F1239] tabular-nums">
                    Ukupno: {formatRsd(order.pricing.total)}{' '}
                    <span className="text-[11px] font-normal text-[#6B6862]">
                      ({order.pricing.isFreeShipping ? 'Besplatna dostava' : `Dostava ${formatRsd(order.pricing.shippingCost)}`})
                    </span>
                  </p>
                </div>

                <div className="md:col-span-3 space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={
                        trackingInputs[order.id] ?? order.shipping?.trackingNumber ?? ''
                      }
                      onChange={(e) =>
                        setTrackingInputs((prev) => ({
                          ...prev,
                          [order.id]: e.target.value,
                        }))
                      }
                      placeholder="Broj pošiljke..."
                      className="h-8 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-[11px] flex-1 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(order, 'Poslata')}
                      title="Sačuvaj broj pošiljke i označi Poslata"
                      className="h-8 px-2 rounded-lg bg-[#121212] text-white text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Truck className="w-3 h-3" />
                      <span>Poslata</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyViberTemplate(order)}
                      className="h-7 px-2 rounded-lg border border-[#D8D2C5] text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Viber</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintOrder(order)}
                      className="h-7 px-2 rounded-lg border border-[#D8D2C5] text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Adresnica</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openReturnModal(order)}
                      className="h-7 px-2 rounded-lg border border-rose-200 text-[#9F1239] text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Povraćaj / Oštećenje</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Manual Order Modal */}
      {showManualModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        >
          <div
            className="absolute inset-0"
            onClick={() => setShowManualModal(false)}
            aria-hidden="true"
          />
          <form
            onSubmit={handleCreateManualOrder}
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#FAF9F6] border border-[#E6E2D8] rounded-2xl p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-lg font-semibold">
                Nova ručna porudžbina
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="w-8 h-8 rounded-full border border-[#D8D2C5] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Kanal prodaje</label>
                <select
                  value={manualSource}
                  onChange={(e) => setManualSource(e.target.value as OrderSource)}
                  className="w-full h-10 px-2 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Poštarina override</label>
                <input
                  type="number"
                  value={manualShippingOverride}
                  onChange={(e) => setManualShippingOverride(e.target.value)}
                  placeholder="Auto (0/450)"
                  className="w-full h-10 px-2.5 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Artikal *</label>
              <select
                value={manualProductId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setManualProductId(nextId);
                  const found = products.find((p) => p.id === nextId);
                  const firstSz = found
                    ? (Object.entries(found.stockBySize).find(([, q]) => (q ?? 0) > 0)?.[0] as ProductSize)
                    : undefined;
                  if (firstSz) setManualSize(firstSz);
                }}
                className="w-full h-10 px-2.5 bg-white border border-[#D8D2C5] rounded-xl text-xs"
              >
                {products
                  .filter((p) => getTotalStock(p.stockBySize, p.variants) > 0)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {formatRsd(p.salePrice)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Veličina *</label>
                <select
                  value={manualSize}
                  onChange={(e) => setManualSize(e.target.value as ProductSize)}
                  className="w-full h-10 px-2.5 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                >
                  {(activeManualSizes.length > 0 ? activeManualSizes : ['M']).map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Količina</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={manualQty}
                  onChange={(e) => setManualQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full h-10 px-2.5 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={manualPickup}
                onChange={(e) => setManualPickup(e.target.checked)}
                className="w-4 h-4 accent-[#9F1239]"
              />
              <span>Lično preuzimanje (0 RSD dostava)</span>
            </label>

            <input
              type="text"
              required
              value={manualFullName}
              onChange={(e) => setManualFullName(e.target.value)}
              placeholder="Ime i prezime kupca *"
              className="w-full h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
            />
            {!manualPickup && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={manualStreet}
                  onChange={(e) => setManualStreet(e.target.value)}
                  placeholder="Ulica i broj *"
                  className="h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
                <input
                  type="text"
                  required
                  value={manualCityZip}
                  onChange={(e) => setManualCityZip(e.target.value)}
                  placeholder="Grad i PTT *"
                  className="h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
              </div>
            )}
            <input
              type="tel"
              required
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              placeholder="Telefon kupca (06x...) *"
              className="w-full h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
            />
            <input
              type="text"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Napomena (opciono)"
              className="w-full h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
            />

            <button
              type="submit"
              disabled={manualSaving}
              className="w-full h-11 rounded-xl bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
            >
              {manualSaving ? 'Snimanje...' : 'Kreiraj porudžbinu i skini zalihe'}
            </button>
          </form>
        </div>
      )}

      {/* Return / Damaged Item Modal */}
      {returnOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        >
          <div
            className="absolute inset-0"
            onClick={() => setReturnOrder(null)}
            aria-hidden="true"
          />
          <form
            onSubmit={handleProcessReturn}
            className="relative w-full max-w-md bg-[#FAF9F6] border border-[#E6E2D8] rounded-2xl p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-lg font-semibold">
                Povraćaj / Oštećenje ({returnOrder.id})
              </h3>
              <button
                type="button"
                onClick={() => setReturnOrder(null)}
                className="w-8 h-8 rounded-full border border-[#D8D2C5] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {Object.entries(returnQtys).map(([key, counts]) => {
                const [, sz] = key.split(':');
                return (
                  <div
                    key={key}
                    className="p-2.5 rounded-xl bg-white border border-[#E6E2D8] text-xs space-y-1.5"
                  >
                    <p className="font-semibold">Veličina {sz}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-emerald-800">
                          Ispravno (vraća se na stanje)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={counts.good}
                          onChange={(e) =>
                            setReturnQtys((prev) => ({
                              ...prev,
                              [key]: { ...counts, good: Math.max(0, Number(e.target.value) || 0) },
                            }))
                          }
                          className="w-full h-9 px-2 border border-[#D8D2C5] rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#9F1239]">
                          Oštećeno (ne vraća se u prodaju)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={counts.damaged}
                          onChange={(e) =>
                            setReturnQtys((prev) => ({
                              ...prev,
                              [key]: {
                                ...counts,
                                damaged: Math.max(0, Number(e.target.value) || 0),
                              },
                            }))
                          }
                          className="w-full h-9 px-2 border border-[#D8D2C5] rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold mb-1">Povraćaj novca (RSD)</label>
                <input
                  type="number"
                  value={returnRefundRsd}
                  onChange={(e) => setReturnRefundRsd(e.target.value)}
                  className="w-full h-10 px-2.5 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1">Trošak povratne poštarine</label>
                <input
                  type="number"
                  value={returnShippingCost}
                  onChange={(e) => setReturnShippingCost(e.target.value)}
                  className="w-full h-10 px-2.5 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
              </div>
            </div>

            <input
              type="text"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Razlog povraćaja"
              className="w-full h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
            />

            <button
              type="submit"
              disabled={returnSaving}
              className="w-full h-11 rounded-xl bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
            >
              {returnSaving ? 'Obrada...' : 'Evidentiraj povraćaj'}
            </button>
          </form>
        </div>
      )}

      {/* Printable Packing Slip / Address Label Modal */}
      {printOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        >
          <div
            className="absolute inset-0"
            onClick={() => setPrintOrder(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white border border-[#121212] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <p className="font-editorial text-lg font-bold">{settings.brandName}</p>
                <p className="text-[11px] text-[#6B6862]">Otpremnica &amp; Adresnica za kurira</p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-9 px-3 rounded-lg bg-[#121212] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer print:hidden"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Štampaj</span>
              </button>
            </div>

            <div className="p-3 rounded-xl border border-[#121212] space-y-1 text-xs">
              <p className="text-[10px] uppercase tracking-wider text-[#6B6862]">PRIMALAC (POUZEĆE)</p>
              <p className="text-base font-bold">{printOrder.customer.fullName}</p>
              <p>{printOrder.customer.street}</p>
              <p className="font-semibold">{printOrder.customer.cityZip}</p>
              <p className="font-bold tabular-nums">Tel: {printOrder.customer.phone}</p>
            </div>

            <div className="text-xs space-y-1">
              <p className="font-semibold">
                Porudžbina #{printOrder.id} · Otkupnina:{' '}
                <strong className="text-[#9F1239]">{formatRsd(printOrder.pricing.total)}</strong>
              </p>
              {(printOrder.items && printOrder.items.length > 0
                ? printOrder.items
                : [
                    {
                      title: printOrder.productTitle,
                      size: printOrder.selectedSize,
                      quantity: printOrder.bundleQuantity,
                    },
                  ]
              ).map((it, idx) => (
                <p key={idx}>
                  • {it.title} ({it.size}) × {it.quantity}
                </p>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPrintOrder(null)}
              className="w-full h-10 rounded-xl border border-[#D8D2C5] text-xs font-semibold cursor-pointer print:hidden"
            >
              Zatvori pregled štampe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
