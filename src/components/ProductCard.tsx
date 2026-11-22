import { useState } from 'react';
import { Heart, MessageCircle, Plus, ShoppingBag } from 'lucide-react';
import type { Product, ProductSize } from '../types/store';
import {
  formatRsd,
  getDiscountPercent,
  getFirstAvailableSize,
  getSizeEntries,
  getUrgencyBadgeText,
  isSoldOut,
} from '../utils/storeLogic';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onOpenProductPage: (product: Product) => void;
  onOpenOrderModal: (product: Product, preselectedSize?: ProductSize) => void;
  onQuickAddToCart: (product: Product, size: ProductSize) => void;
  onViberOrder?: (product: Product, preselectedSize?: ProductSize) => void;
}

export function ProductCard({
  product,
  isWishlisted,
  onToggleWishlist,
  onOpenProductPage,
  onOpenOrderModal,
  onQuickAddToCart,
  onViberOrder,
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false);

  const soldOut = isSoldOut(product);
  const urgencyBadge = getUrgencyBadgeText(product);
  const discount = getDiscountPercent(product.originalPrice, product.salePrice);
  const sizeEntries = getSizeEntries(product);
  const defaultSize = getFirstAvailableSize(product);

  const topLeftBadge = discount > 0 ? `-${discount}%` : product.isNew ? 'NOVO' : null;

  return (
    <article className="group flex flex-col bg-white rounded-xl border border-[#ECE8DF] overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* 3:4 Image Container */}
      <div className="relative aspect-[3/4] w-full bg-[#F3F2EE] overflow-hidden">
        <button
          type="button"
          onClick={() => onOpenProductPage(product)}
          aria-label={`Otvori stranicu artikla ${product.title}`}
          className="w-full h-full block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F1239] cursor-pointer"
        >
          {!imageError ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className={`w-full h-full object-cover object-center transition-transform duration-500 ease-out ${
                soldOut ? 'opacity-65 grayscale-[30%]' : 'group-hover:scale-105'
              }`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-[#F3F2EE] to-[#E9E4DA]">
              <ShoppingBag className="w-8 h-8 text-[#6B6862] mb-2" aria-hidden="true" />
              <span className="text-xs font-medium text-[#6B6862] line-clamp-2">
                {product.title}
              </span>
            </div>
          )}

          {/* Top-left Discount or NOVO Badge */}
          {topLeftBadge && !soldOut && (
            <span
              className={`absolute top-2 left-2 sm:top-2.5 sm:left-2.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold tracking-wide tabular-nums ${
                discount > 0
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-[#121212] text-white'
              }`}
            >
              {topLeftBadge}
            </span>
          )}

          {/* Bottom-left Truthful Urgency Badge */}
          {urgencyBadge && !soldOut && (
            <span className="absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5 max-w-[calc(100%-16px)] truncate px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-white/95 backdrop-blur-sm border border-[#9F1239]/25 text-[#9F1239] text-[10px] sm:text-[11px] font-semibold shadow-sm">
              {urgencyBadge}
            </span>
          )}

          {/* Sold Out Overlay */}
          {soldOut && (
            <div className="absolute inset-0 bg-[#121212]/45 backdrop-blur-[1px] flex items-center justify-center">
              <span className="px-4 py-1.5 rounded-full bg-white text-[#121212] text-xs font-bold tracking-[0.14em] uppercase shadow-sm">
                PRODATO
              </span>
            </div>
          )}
        </button>

        {/* Top-right Wishlist Heart Toggle */}
        <button
          type="button"
          onClick={() => onToggleWishlist(product)}
          aria-pressed={isWishlisted}
          aria-label={
            isWishlisted
              ? `Ukloni iz liste želja: ${product.title}`
              : `Dodaj u listu želja: ${product.title}`
          }
          className={`absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm border ${
            isWishlisted
              ? 'bg-white border-[#9F1239]/30 text-[#9F1239]'
              : 'bg-white/90 backdrop-blur-sm border-[#E6E2D8] text-[#121212] hover:bg-white'
          }`}
        >
          <Heart
            className={`w-4 h-4 transition-transform ${
              isWishlisted ? 'fill-[#9F1239] text-[#9F1239] scale-105' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Card Body */}
      <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between gap-2.5">
        <div>
          <p className="text-[11px] text-[#6B6862] truncate">
            {product.category}
            {product.brand ? ` · ${product.brand}` : ''}
          </p>

          <h2 className="mt-1 text-[13px] sm:text-[15px] font-semibold text-[#121212] leading-snug line-clamp-2 min-h-[2.4em]">
            <button
              type="button"
              onClick={() => onOpenProductPage(product)}
              className="text-left hover:text-[#9F1239] transition-colors cursor-pointer"
            >
              {product.title}
            </button>
          </h2>

          {/* Price Display */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
            <span className="text-[15px] sm:text-base font-bold text-[#121212]">
              {formatRsd(product.salePrice)}
            </span>
            {product.originalPrice > product.salePrice && (
              <span className="text-xs text-[#6B6862] line-through">
                {formatRsd(product.originalPrice)}
              </span>
            )}
          </div>

          {/* Available Size Chips */}
          <div className="mt-2.5 flex flex-wrap gap-1">
            {sizeEntries.map(([size, qty]) => {
              const available = qty > 0 && !soldOut;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!available}
                  onClick={() => onOpenOrderModal(product, size)}
                  title={available ? `Poruči veličinu ${size}` : `${size} rasprodato`}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    available
                      ? 'bg-[#F3F2EE] text-[#121212] hover:bg-[#121212] hover:text-white cursor-pointer'
                      : 'bg-[#FAF9F6] text-[#6B6862]/45 line-through cursor-not-allowed'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions: Instant 1-Step Order + Add to Cart + Viber Order */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={soldOut}
              onClick={() => onOpenOrderModal(product)}
              className={`flex-1 h-10 sm:h-11 rounded-lg text-xs sm:text-[13px] font-semibold tracking-wide transition-colors cursor-pointer ${
                soldOut
                  ? 'bg-[#E7E4DC] text-[#6B6862] cursor-not-allowed'
                  : 'bg-[#9F1239] hover:bg-[#881337] text-white'
              }`}
            >
              {soldOut ? 'PRODATO' : 'PORUČI ODMAH'}
            </button>

            {!soldOut && defaultSize && (
              <button
                type="button"
                onClick={() => onQuickAddToCart(product, defaultSize)}
                aria-label={`Dodaj u korpu: ${product.title} (${defaultSize})`}
                title={`Dodaj u korpu (${defaultSize})`}
                className="w-10 sm:w-11 h-10 sm:h-11 rounded-lg border border-[#E2DDD3] bg-[#FAF9F6] hover:bg-[#121212] hover:text-white hover:border-[#121212] text-[#121212] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {!soldOut && onViberOrder && (
            <button
              type="button"
              onClick={() => onViberOrder(product, defaultSize ?? undefined)}
              aria-label={`Poruči preko Vibera: ${product.title}`}
              className="w-full h-9 rounded-lg border border-[#7360F2]/30 bg-[#7360F2]/8 hover:bg-[#7360F2] text-[#5E4BD8] hover:text-white text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Poruči preko Vibera</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
