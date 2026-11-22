import { useState } from 'react';
import { Clock, Mail, MessageCircle, Phone, Search, Truck, X } from 'lucide-react';
import { DEFAULT_STORE_SETTINGS } from '../config/storeConfig';
import type { StoreSettings } from '../types/store';
import { trackOrderApi, type TrackedOrderSummary } from '../utils/api';
import {
  buildTelHref,
  buildViberDirectChatUrl,
  normalizeToInternationalPhone,
} from '../utils/viberLogic';
import { formatRsd } from '../utils/storeLogic';

interface TrackingInfoModalProps {
  isOpen: boolean;
  settings?: StoreSettings;
  onClose: () => void;
}

export function TrackingInfoModal({
  isOpen,
  settings = DEFAULT_STORE_SETTINGS,
  onClose,
}: TrackingInfoModalProps) {
  const [orderCode, setOrderCode] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [results, setResults] = useState<TrackedOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanCode = orderCode.trim();
    const cleanLast4 = phoneLast4.replace(/\D/g, '').slice(-4);
    if (!cleanCode || cleanLast4.length !== 4) {
      setError('Unesite šifru porudžbine (npr. AO-2611-4821) i poslednje 4 cifre broja telefona.');
      return;
    }

    setLoading(true);
    try {
      const matches = await trackOrderApi(cleanCode, cleanLast4);
      setResults(matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri proveri porudžbine.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const intlPhone = normalizeToInternationalPhone(
    settings.contactViberNumber || settings.contactPhoneDisplay,
  );
  const phoneHref = buildTelHref(settings.contactPhoneDisplay || intlPhone);
  const viberHref = buildViberDirectChatUrl(intlPhone);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Praćenje porudžbine i kontakt podrške"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAF9F6] border border-[#E6E2D8] rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-[#E6E2D8] bg-white flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="font-editorial text-lg font-semibold text-[#121212]">
              Praćenje porudžbine &amp; Kontakt
            </h2>
            <p className="text-xs text-[#6B6862]">
              Privatna provera statusa pošiljke uz šifru i poslednje 4 cifre telefona
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zatvori prozor za praćenje"
            className="w-9 h-9 rounded-full border border-[#E2DDD3] hover:border-[#121212] flex items-center justify-center text-[#121212] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Privacy-Protected Order Tracking Form */}
          <form onSubmit={handleTrack} className="space-y-2.5">
            <label
              htmlFor="track-order-code"
              className="block text-xs font-semibold uppercase tracking-wide text-[#121212]"
            >
              Proverite status porudžbine
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="relative sm:col-span-7">
                <Search
                  className="w-4 h-4 text-[#6B6862] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="track-order-code"
                  type="text"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder="Šifra (npr. AO-2611-4821)"
                  aria-label="Šifra porudžbine"
                  className="w-full h-11 pl-10 pr-3 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] focus:outline-none focus:border-[#121212]"
                />
              </div>
              <div className="sm:col-span-5">
                <input
                  id="track-order-phone4"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={phoneLast4}
                  onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Zadnje 4 cifre tel."
                  aria-label="Poslednje 4 cifre broja telefona"
                  className="w-full h-11 px-3 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] tabular-nums focus:outline-none focus:border-[#121212]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              {loading ? 'Proveravam status...' : 'Proveri status pošiljke'}
            </button>
            {error && (
              <p role="alert" className="text-xs text-[#9F1239] font-medium">
                {error}
              </p>
            )}
          </form>

          {results !== null && (
            <div className="space-y-2.5">
              {results.length === 0 ? (
                <p className="p-3 rounded-xl bg-white border border-[#E6E2D8] text-xs text-[#6B6862]">
                  Nismo pronašli porudžbinu koja se poklapa sa tom šifrom i poslednjim 4 ciframa
                  telefona. Proverite unos ili nam pišite na Viber.
                </p>
              ) : (
                results.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-white border border-[#E6E2D8] text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#121212] tabular-nums text-sm">
                        {item.id}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#121212] text-white font-semibold">
                        Status: {item.status}
                      </span>
                    </div>
                    <p className="text-[#121212] font-medium">
                      {item.productTitle}
                      {item.itemsCount > 1
                        ? ` (+ još ${item.itemsCount - 1} art.)`
                        : ` (${item.selectedSize}) × ${item.bundleQuantity}`}
                    </p>
                    <div className="flex justify-between text-[#6B6862] tabular-nums">
                      <span>{item.cityZip} · {item.courier}</span>
                      <span className="font-semibold text-[#121212]">
                        {formatRsd(item.total)}
                      </span>
                    </div>
                    {item.trackingNumber && (
                      <div className="p-2 rounded-lg bg-[#FAF9F6] border border-[#EAE5DA] text-[11px] flex items-center justify-between">
                        <span className="text-[#6B6862]">Broj pošiljke ({item.courier}):</span>
                        <strong className="text-[#121212] tabular-nums">{item.trackingNumber}</strong>
                      </div>
                    )}
                    {item.statusHistory && item.statusHistory.length > 0 && (
                      <div className="pt-2 border-t border-[#F0ECE3] space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B6862]">
                          Istorija promena statusa:
                        </p>
                        {item.statusHistory.map((h, i) => (
                          <div
                            key={`${h.status}-${i}`}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="font-medium text-[#121212]">{h.status}</span>
                            <span className="text-[#6B6862] tabular-nums">
                              {new Date(h.at).toLocaleString('sr-RS', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Delivery & Direct Contact Cards */}
          <div className="bg-white border border-[#E6E2D8] rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Truck className="w-4 h-4 text-[#9F1239] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold text-[#121212]">
                  Post Express isporuka (24–48h)
                </p>
                <p className="text-[#6B6862] mt-0.5">
                  Sve porudžbine primljene radnim danom do 15h šaljemo istog dana. Poštarina je{' '}
                  {formatRsd(settings.shippingCostRsd)}, a besplatna preko{' '}
                  {formatRsd(settings.freeShippingThresholdRsd)} ili uz paket od 3 komada.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#F0ECE3] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href={phoneHref}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF9F6] hover:bg-[#F3F2EE] text-[#121212] font-semibold transition-colors"
              >
                <Phone className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
                <span className="tabular-nums">Pozovi nas: {settings.contactPhoneDisplay}</span>
              </a>

              <a
                href={`mailto:${settings.contactEmail}`}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF9F6] hover:bg-[#F3F2EE] text-[#121212] font-medium transition-colors truncate"
              >
                <Mail className="w-4 h-4 text-[#9F1239] shrink-0" aria-hidden="true" />
                <span className="truncate">{settings.contactEmail}</span>
              </a>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#6B6862] pt-1 gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {settings.dispatchHours}
              </span>
              <a
                href={viberHref}
                className="inline-flex items-center gap-1 text-[#7360F2] font-semibold hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pišite na Viber ({settings.contactPhoneDisplay})</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
