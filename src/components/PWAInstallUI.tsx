import { useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#C5A059] text-[#121212] text-xs font-semibold cursor-pointer hover:bg-[#d4b06b] transition-colors shrink-0"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Instaliraj Admin</span>
        <span className="sm:hidden">App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-white/25 text-white text-xs font-medium cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Dodaj na ekran</span>
          <span className="sm:hidden">iOS App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 text-[#121212]">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-3">
              <h3 className="font-editorial text-lg font-semibold">
                Instalacija na iPhone / iPad
              </h3>
              <p className="text-xs text-[#6B6862] leading-relaxed">
                1. Dodirnite dugme <strong>Share (Deli)</strong> u donjoj traci Safari pregledača.
                <br />
                2. Izaberite <strong>Add to Home Screen (Dodaj na početni ekran)</strong> radi bržeg rada sa terena.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full h-10 rounded-xl bg-[#121212] text-white text-xs font-semibold cursor-pointer"
              >
                Zatvori
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 sm:bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Nema internet veze — slanje porudžbina je pauzirano</span>
    </div>
  );
}
