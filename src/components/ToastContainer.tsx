import { CheckCircle2, Heart, MessageCircle, X } from 'lucide-react';
import type { ToastMessage } from '../utils/wishlistAndToast';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Obaveštenja"
      className="fixed bottom-16 right-4 left-4 sm:right-auto sm:bottom-6 sm:left-6 sm:w-[370px] z-[60] pointer-events-none flex flex-col gap-2.5"
    >
      {toasts.map((toast) => {
        const isOrder = toast.kind === 'order';
        const isWishlistAdd = toast.kind === 'wishlist-add';
        const isWishlistRemove = toast.kind === 'wishlist-remove';

        return (
          <div
            key={toast.id}
            role="status"
            className="animate-toast-enter pointer-events-auto bg-white/96 backdrop-blur-md border border-[#E6E2D8] rounded-2xl p-3.5 shadow-[0_14px_34px_rgba(18,18,18,0.12)] flex items-start gap-3"
          >
            {/* Luxury Icon Badge */}
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isOrder
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : isWishlistAdd
                    ? 'bg-[#9F1239]/10 text-[#9F1239] border border-[#9F1239]/20'
                    : isWishlistRemove
                      ? 'bg-[#F3F2EE] text-[#6B6862] border border-[#E6E2D8]'
                      : 'bg-[#121212] text-[#C5A059]'
              }`}
              aria-hidden="true"
            >
              {isOrder ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : isWishlistAdd ? (
                <Heart className="w-4 h-4 fill-[#9F1239] text-[#9F1239]" />
              ) : isWishlistRemove ? (
                <Heart className="w-4 h-4" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
            </div>

            {/* Copy & Optional Action */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-[13px] font-semibold text-[#121212] leading-snug">
                {toast.title}
              </p>
              {toast.message && (
                <p className="text-xs text-[#6B6862] mt-0.5 leading-snug line-clamp-2">
                  {toast.message}
                </p>
              )}
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    onDismiss(toast.id);
                  }}
                  className="mt-1.5 text-xs font-semibold text-[#9F1239] hover:text-[#881337] underline underline-offset-2 cursor-pointer"
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>

            {/* Dismiss Button */}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Zatvori obaveštenje"
              className="w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-[#6B6862] hover:text-[#121212] hover:bg-[#F3F2EE] transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
