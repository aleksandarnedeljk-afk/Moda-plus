import { useEffect } from 'react';
import { Heart, ShoppingBag, Trash2, X } from 'lucide-react';
import type { Product } from '../types/store';
import { formatRsd, isSoldOut } from '../utils/storeLogic';

interface WishlistDrawerProps {
  isOpen: boolean;
  products: Product[];
  onClose: () => void;
  onRemoveItem: (product: Product) => void;
  onOrderItem: (product: Product) => void;
}

export function WishlistDrawer({
  isOpen,
  products,
  onClose,
  onRemoveItem,
  onOrderItem,
}: WishlistDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lista želja"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md h-full bg-[#FAF9F6] border-l border-[#E6E2D8] shadow-2xl flex flex-col">
        <div className="px-5 py-4 bg-white border-b border-[#E6E2D8] flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-xl font-semibold text-[#121212]">
              Lista želja
            </h2>
            <p className="text-xs text-[#6B6862] tabular-nums">
              Sačuvani artikli: <strong className="text-[#121212]">{products.length}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zatvori listu želja"
            className="w-10 h-10 rounded-full border border-[#E2DDD3] hover:border-[#121212] flex items-center justify-center text-[#121212] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {products.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-white border border-[#E6E2D8] flex items-center justify-center text-[#6B6862]">
                <Heart className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="font-editorial text-lg font-semibold text-[#121212] mt-4">
                Lista želja je prazna
              </p>
              <p className="text-xs sm:text-sm text-[#6B6862] mt-1.5 max-w-xs">
                Dodirnite srce na bilo kom artiklu da biste sačuvali omiljene modele dok
                istražujete rasprodaju.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 h-11 px-6 rounded-full bg-[#121212] text-white text-xs font-semibold cursor-pointer"
              >
                Nazad na ponudu
              </button>
            </div>
          ) : (
            products.map((product) => {
              const soldOut = isSoldOut(product);
              return (
                <div
                  key={product.id}
                  className="bg-white border border-[#E6E2D8] rounded-xl p-3 flex gap-3.5"
                >
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    referrerPolicy="no-referrer"
                    className="w-20 h-26 object-cover rounded-lg bg-[#F3F2EE] shrink-0"
                  />

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="text-[11px] text-[#6B6862] truncate">
                        {product.category}
                      </p>
                      <h3 className="text-sm font-semibold text-[#121212] leading-snug line-clamp-2 mt-0.5">
                        {product.title}
                      </h3>
                      <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
                        <span className="text-sm font-bold text-[#121212]">
                          {formatRsd(product.salePrice)}
                        </span>
                        {product.originalPrice > product.salePrice && (
                          <span className="text-[11px] text-[#6B6862] line-through">
                            {formatRsd(product.originalPrice)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        type="button"
                        disabled={soldOut}
                        onClick={() => {
                          onClose();
                          onOrderItem(product);
                        }}
                        className={`flex-1 h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                          soldOut
                            ? 'bg-[#E7E4DC] text-[#6B6862] cursor-not-allowed'
                            : 'bg-[#9F1239] hover:bg-[#881337] text-white'
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{soldOut ? 'PRODATO' : 'Poruči'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(product)}
                        aria-label={`Ukloni ${product.title} iz liste želja`}
                        className="w-9 h-9 rounded-lg border border-[#E2DDD3] hover:border-[#9F1239] text-[#6B6862] hover:text-[#9F1239] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
