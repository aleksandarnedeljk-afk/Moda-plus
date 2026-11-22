import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { StoreSettings } from '../types/store';

export const CONSENT_BANNER_STORAGE_KEY = 'atelier_cookie_consent_v1';

interface ConsentState {
  essential: true;
  analytics: boolean;
  decidedAt: string;
}

interface ConsentBannerProps {
  settings: StoreSettings;
  onOpenPrivacy: () => void;
  onConsentSaved?: () => void;
}

export function ConsentBanner({
  settings,
  onOpenPrivacy,
  onConsentSaved,
}: ConsentBannerProps) {
  const [consent, setConsent] = useState<ConsentState | null>(() => {
    try {
      const raw = localStorage.getItem(CONSENT_BANNER_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ConsentState;
    } catch {
      return null;
    }
  });

  // Only load optional GA4 / Meta Pixel scripts when BOTH configured by owner AND explicitly accepted
  useEffect(() => {
    if (!consent?.analytics) return;

    const gaId = settings.ga4MeasurementId?.trim();
    if (gaId && /^G-[A-Z0-9]+$/i.test(gaId) && !document.getElementById('atelier-ga4-script')) {
      const s = document.createElement('script');
      s.id = 'atelier-ga4-script';
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
      document.head.appendChild(s);
    }

    const pixelId = settings.metaPixelId?.trim();
    if (pixelId && /^\d{8,20}$/.test(pixelId) && !document.getElementById('atelier-pixel-img')) {
      // Safe noscript-equivalent beacon image if Meta Pixel script is desired only on explicit opt-in
      const img = new Image(1, 1);
      img.id = 'atelier-pixel-img';
      img.alt = '';
      img.src = `https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`;
    }
  }, [consent, settings.ga4MeasurementId, settings.metaPixelId]);

  if (consent) return null;

  const saveConsent = (analytics: boolean) => {
    const next: ConsentState = {
      essential: true,
      analytics,
      decidedAt: new Date().toISOString(),
    };
    setConsent(next);
    try {
      localStorage.setItem(CONSENT_BANNER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failure
    }
    onConsentSaved?.();
  };

  return (
    <aside
      aria-label="Obaveštenje o kolačićima i privatnosti"
      className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 max-w-4xl mx-auto z-40 bg-[#121212]/95 backdrop-blur-md text-white border border-white/15 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-2.5 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
    >
      <div className="flex items-start sm:items-center gap-2 text-[11px] sm:text-xs leading-snug">
        <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
        <p className="text-white/85">
          <strong className="text-white">Kolačići:</strong> Neophodni rade za korpu i porudžbinu; analitiku učitavamo samo uz vašu saglasnost.{' '}
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="underline text-[#C5A059] cursor-pointer"
          >
            Politika privatnosti
          </button>
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          onClick={() => saveConsent(false)}
          className="h-7 px-2.5 rounded-lg border border-white/25 hover:bg-white/10 text-[11px] font-medium cursor-pointer"
        >
          Samo neophodni
        </button>
        <button
          type="button"
          onClick={() => saveConsent(true)}
          className="h-7 px-3 rounded-lg bg-[#9F1239] hover:bg-[#881337] text-white text-[11px] font-semibold cursor-pointer"
        >
          Prihvati sve
        </button>
      </div>
    </aside>
  );
}
