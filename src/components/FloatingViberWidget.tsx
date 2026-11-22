import { useState } from 'react';
import { Check, Copy, MessageCircle, PhoneCall, X } from 'lucide-react';
import type { StoreSettings } from '../types/store';
import {
  buildTelHref,
  buildViberDirectChatUrl,
  normalizeToInternationalPhone,
} from '../utils/viberLogic';

interface FloatingViberWidgetProps {
  settings: StoreSettings;
  hidden?: boolean;
  hasBottomOverlay?: boolean;
  onPhoneCopied?: () => void;
}

export function FloatingViberWidget({
  settings,
  hidden = false,
  hasBottomOverlay = false,
  onPhoneCopied,
}: FloatingViberWidgetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (hidden) return null;

  const intlNumber = normalizeToInternationalPhone(
    settings.contactViberNumber || settings.contactPhoneDisplay,
  );
  const viberChatUrl = buildViberDirectChatUrl(intlNumber);
  const telHref = buildTelHref(settings.contactPhoneDisplay || intlNumber);

  const handleCopyPhone = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(intlNumber);
      }
      setCopied(true);
      onPhoneCopied?.();
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className={`fixed right-3 sm:right-6 z-30 flex flex-col items-end gap-2 transition-all duration-200 ${
        hasBottomOverlay ? 'bottom-20 sm:bottom-6' : 'bottom-4 sm:bottom-6'
      }`}
    >
      {menuOpen && (
        <div
          role="region"
          aria-label="Brzi Viber i telefonski kontakt"
          className="w-68 bg-white border border-[#E6E2D8] rounded-2xl shadow-2xl p-3.5 space-y-2.5 text-xs"
        >
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#F0ECE3]">
            <div>
              <p className="font-editorial text-sm font-semibold text-[#121212]">
                {settings.brandName}
              </p>
              <p className="text-[11px] text-[#6B6862] tabular-nums mt-0.5">
                Telefon &amp; Viber: {settings.contactPhoneDisplay}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Zatvori Viber meni"
              className="w-7 h-7 rounded-full border border-[#E2DDD3] flex items-center justify-center text-[#121212] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <a
            href={viberChatUrl}
            onClick={() => setMenuOpen(false)}
            className="w-full h-10 px-3 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>Otvori Viber razgovor</span>
          </a>

          <a
            href={telHref}
            className="w-full h-10 px-3 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <PhoneCall className="w-4 h-4" aria-hidden="true" />
            <span>Pozovi nas ({settings.contactPhoneDisplay})</span>
          </a>

          <button
            type="button"
            onClick={() => void handleCopyPhone()}
            className="w-full h-9 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF9F6] hover:border-[#121212] text-[#121212] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>Broj kopiran ({intlNumber})</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kopiraj broj ({intlNumber})</span>
              </>
            )}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-label="Kontaktiraj nas na Viber ili telefonom"
        className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-full bg-[#7360F2] hover:bg-[#5E4BD8] text-white shadow-xl border border-white/25 inline-flex items-center gap-2 text-xs font-semibold transition-transform hover:scale-[1.03] cursor-pointer"
      >
        <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Viber</span>
      </button>
    </div>
  );
}
