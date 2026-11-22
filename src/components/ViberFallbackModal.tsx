import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  MessageCircle,
  PhoneCall,
  Smartphone,
  X,
} from 'lucide-react';
import type { StoreSettings } from '../types/store';
import {
  buildTelHref,
  buildViberDirectChatUrl,
  buildViberForwardTextUrl,
  getDisplayDevicePlatform,
  normalizeToInternationalPhone,
} from '../utils/viberLogic';

export interface ViberModalPayload {
  title: string;
  subtitle?: string;
  message: string;
}

interface ViberFallbackModalProps {
  payload: ViberModalPayload | null;
  settings: StoreSettings;
  onClose: () => void;
  onCopied?: (what: 'message' | 'phone') => void;
}

export function ViberFallbackModal({
  payload,
  settings,
  onClose,
  onCopied,
}: ViberFallbackModalProps) {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    setCopiedMsg(false);
    setCopiedPhone(false);
  }, [payload]);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload, onClose]);

  if (!payload) return null;

  const platform = getDisplayDevicePlatform();
  const rawPhoneOrViber = settings.contactViberNumber || settings.contactPhoneDisplay;
  const intlViberNumber = normalizeToInternationalPhone(rawPhoneOrViber);
  const directChatHref = buildViberDirectChatUrl(intlViberNumber);
  const forwardTextHref = buildViberForwardTextUrl(payload.message);
  const telHref = buildTelHref(settings.contactPhoneDisplay || intlViberNumber);

  const handleCopyMessage = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload.message);
      }
      setCopiedMsg(true);
      onCopied?.('message');
      window.setTimeout(() => setCopiedMsg(false), 3000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyPhone = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(intlViberNumber);
      }
      setCopiedPhone(true);
      onCopied?.('phone');
      window.setTimeout(() => setCopiedPhone(false), 3000);
    } catch {
      // ignore clipboard errors
    }
  };

  const platformNote =
    platform === 'desktop'
      ? 'Na računaru: ako nemate instaliranu Viber Desktop aplikaciju, kopirajte poruku i broj telefona ispod ili nas pozovite.'
      : platform === 'ios'
        ? 'Na iPhone uređaju: otvorite Viber razgovor klikom na dugme ispod i nalepite kopiranu poruku.'
        : 'Na Android uređaju: možete pokrenuti direktan Viber razgovor ili proslediti pripremljenu poruku jednim dodirom.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Poručivanje i kontakt preko Vibera"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#FAF9F6] rounded-t-2xl sm:rounded-2xl border border-[#E6E2D8] shadow-2xl">
        <div className="px-5 py-4 bg-white border-b border-[#E6E2D8] flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-[#7360F2]/12 text-[#7360F2] flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-editorial text-lg font-semibold text-[#121212] truncate">
                {payload.title}
              </h2>
              {payload.subtitle && (
                <p className="text-xs text-[#6B6862] truncate">{payload.subtitle}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zatvori Viber prozor"
            className="w-9 h-9 rounded-full border border-[#E2DDD3] hover:border-[#121212] flex items-center justify-center text-[#121212] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Official Viber & Phone Card */}
          <div className="bg-white border border-[#E6E2D8] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6862]">
                Zvanični Viber &amp; telefon ({settings.brandName})
              </p>
              <p className="text-sm font-bold text-[#121212] tabular-nums mt-0.5">
                {settings.contactPhoneDisplay} ({intlViberNumber})
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyPhone()}
              className="h-9 px-3 rounded-lg border border-[#D8D2C5] bg-[#FAF9F6] hover:border-[#121212] text-xs font-semibold text-[#121212] inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedPhone ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                  <span>Broj kopiran</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kopiraj broj</span>
                </>
              )}
            </button>
          </div>

          {/* Prepared Viber Message */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="viber-prepared-msg"
                className="text-xs font-semibold text-[#121212]"
              >
                Pripremljena poruka za Viber:
              </label>
              <button
                type="button"
                onClick={() => void handleCopyMessage()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#9F1239] hover:underline cursor-pointer"
              >
                {copiedMsg ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    <span className="text-emerald-700">Kopirano</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kopiraj poruku</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              id="viber-prepared-msg"
              readOnly
              rows={7}
              value={payload.message}
              className="w-full p-3 rounded-xl bg-white border border-[#D8D2C5] text-xs text-[#121212] leading-relaxed focus:outline-none focus:border-[#121212]"
            />
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href={directChatHref}
              onClick={() => {
                void handleCopyMessage();
              }}
              className="h-11 px-4 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              <span>Otvori Viber razgovor</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={() => void handleCopyMessage()}
              className="h-11 px-4 rounded-xl bg-[#121212] hover:bg-[#2A2A2A] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {copiedMsg ? (
                <>
                  <Check className="w-4 h-4 text-[#C5A059]" aria-hidden="true" />
                  <span>Poruka je kopirana!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  <span>Kopiraj poruku</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href={forwardTextHref}
              className="h-10 px-3 rounded-xl border border-[#D8D2C5] bg-white hover:border-[#7360F2] text-xs font-semibold text-[#121212] flex items-center justify-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#7360F2]" aria-hidden="true" />
              <span>Prosledi tekst u Viber</span>
            </a>

            <a
              href={telHref}
              className="h-10 px-3 rounded-xl border border-[#D8D2C5] bg-white hover:border-[#9F1239] text-xs font-semibold text-[#121212] flex items-center justify-center gap-1.5 transition-colors"
            >
              <PhoneCall className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
              <span>Pozovi nas ({settings.contactPhoneDisplay})</span>
            </a>
          </div>

          {/* Device Compatibility + Truthful Order Disclaimer */}
          <div className="p-3 rounded-xl bg-white border border-[#E6E2D8] text-[11px] text-[#6B6862] space-y-1.5 leading-relaxed">
            <p className="flex items-start gap-2">
              <Smartphone className="w-3.5 h-3.5 text-[#7360F2] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{platformNote}</span>
            </p>
            <p className="flex items-start gap-2 pt-1 border-t border-[#F0ECE3]">
              <Info className="w-3.5 h-3.5 text-[#9F1239] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Otvaranje Vibera ne kreira automatski porudžbinu i ne skida artikle sa stanja — porudžbinu potvrđujemo zajedno u razgovoru.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
