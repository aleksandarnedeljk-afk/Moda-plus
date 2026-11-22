import { RotateCcw } from 'lucide-react';
import type { Product, ProductSize } from '../types/store';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  totalFilteredCount: number;
  isLoading: boolean;
  wishlistIds: string[];
  onToggleWishlist: (product: Product) => void;
  onLoadMore: () => void;
  onResetFilters: () => void;
  onOpenProductPage: (product: Product) => void;
  onOpenOrderModal: (product: Product, preselectedSize?: ProductSize) => void;
  onQuickAddToCart: (product: Product, size: ProductSize) => void;
  onViberOrder?: (product: Product, preselectedSize?: ProductSize) => void;
}

export function ProductGrid({
  products,
  totalFilteredCount,
  isLoading,
  wishlistIds,
  onToggleWishlist,
  onLoadMore,
  onResetFilters,
  onOpenProductPage,
  onOpenOrderModal,
  onQuickAddToCart,
  onViberOrder,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <section
        aria-label="Učitavanje artikala"
        className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-[#ECE8DF] overflow-hidden animate-pulse"
            >
              <div className="aspect-[3/4] bg-[#EFECE5]" />
              <div className="p-3 sm:p-4 space-y-2.5">
                <div className="h-3 w-1/2 bg-[#EFECE5] rounded" />
                <div className="h-4 w-full bg-[#EFECE5] rounded" />
                <div className="h-4 w-2/3 bg-[#EFECE5] rounded" />
                <div className="h-10 w-full bg-[#EFECE5] rounded-lg mt-2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-md mx-auto text-center bg-white border border-[#E6E2D8] rounded-2xl p-8">
          <h2 className="font-editorial text-xl font-semibold text-[#121212]">
            Nema artikala za izabrane filtere
          </h2>
          <p className="text-sm text-[#6B6862] mt-2">
            Pokušajte sa drugom veličinom, kategorijom ili uklonite pretragu da vidite
            kompletnu rasprodaju zaliha.
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#121212] hover:bg-[#2A2A2A] text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Prikaži sve artikle</span>
          </button>
        </div>
      </section>
    );
  }

  const remaining = totalFilteredCount - products.length;

  return (
    <section
      aria-label="Katalog outlet artikala"
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isWishlisted={wishlistIds.includes(product.id)}
            onToggleWishlist={onToggleWishlist}
            onOpenProductPage={onOpenProductPage}
            onOpenOrderModal={onOpenOrderModal}
            onQuickAddToCart={onQuickAddToCart}
            onViberOrder={onViberOrder}
          />
        ))}
      </div>

      <div className="mt-8 sm:mt-10 flex flex-col items-center gap-3">
        <p className="text-xs text-[#6B6862] tabular-nums">
          Prikazano <strong className="text-[#121212]">{products.length}</strong> od{' '}
          <strong className="text-[#121212]">{totalFilteredCount}</strong> artikala
        </p>

        {remaining > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            className="h-12 px-8 rounded-full border border-[#121212] bg-white hover:bg-[#121212] hover:text-white text-sm font-semibold text-[#121212] transition-colors cursor-pointer tabular-nums"
          >
            Učitaj još artikala ({Math.min(12, remaining)} od preostalih {remaining})
          </button>
        )}
      </div>
    </section>
  );
}
