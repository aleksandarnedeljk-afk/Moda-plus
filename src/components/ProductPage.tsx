import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronUp,
  Heart,
  MessageCircle,
  PhoneCall,
  Ruler,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  ADULT_SIZE_GUIDE_ROWS,
  BABY_SIZE_GUIDE_ROWS,
} from '../config/storeConfig';
import type { Product, ProductSize, StoreSettings } from '../types/store';
import { subscribeRestockAlertApi } from '../utils/api';
import {
  formatRsd,
  getDiscountPercent,
  getFirstAvailableSize,
  getProductPath,
  getSizeEntries,
  getTotalStock,
  getUrgencyBadgeText,
  isSoldOut,
} from '../utils/storeLogic';
import { buildTelHref } from '../utils/viberLogic';
import { ProductCard } from './ProductCard';

interface ProductPageProps {
  product: Product;
  allProducts: Product[];
  recentlyViewedProducts: Product[];
  settings: StoreSettings;
  wishlistIds: string[];
  onBackToCatalog: () => void;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product, size: ProductSize) => void;
  onOpenOrderModal: (product: Product, size?: ProductSize) => void;
  onOpenProductPage: (product: Product) => void;
  onShareProductCopied: () => void;
  onViberOrder?: (product: Product, size?: ProductSize) => void;
}

export function ProductPage({
  product,
  allProducts,
  recentlyViewedProducts,
  settings,
  wishlistIds,
  onBackToCatalog,
  onToggleWishlist,
  onAddToCart,
  onOpenOrderModal,
  onOpenProductPage,
  onShareProductCopied,
  onViberOrder,
}: ProductPageProps) {
  const gallery = useMemo(() => {
    const imgs =
      product.galleryImages && product.galleryImages.length > 0
        ? product.galleryImages
        : [product.imageUrl];
    return Array.from(new Set(imgs.filter(Boolean)));
  }, [product]);

  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(() =>
    getFirstAvailableSize(product),
  );
  const [showSizeGuide, setShowSizeGuide] = useState(false);

  // Restock notification form
  const [restockContact, setRestockContact] = useState('');
  const [restockConsent, setRestockConsent] = useState(false);
  const [restockSent, setRestockSent] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);

  useEffect(() => {
    setActiveImgIdx(0);
    setSelectedSize(getFirstAvailableSize(product));
    setRestockSent(false);
    setRestockError(null);
  }, [product]);

  const soldOut = isSoldOut(product);
  const discount = getDiscountPercent(product.originalPrice, product.salePrice);
  const sizeEntries = getSizeEntries(product);
  const totalAvail = getTotalStock(product.stockBySize, product.variants);
  const urgencyBadge = getUrgencyBadgeText(product);
  const isWishlisted = wishlistIds.includes(product.id);

  const similarProducts = useMemo(() => {
    return allProducts
      .filter(
        (p) =>
          p.id !== product.id &&
          !isSoldOut(p) &&
          p.category === product.category,
      )
      .slice(0, 4);
  }, [allProducts, product]);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${getProductPath(product)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.title,
          text: `${product.title} — ${formatRsd(product.salePrice)}`,
          url: shareUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      onShareProductCopied();
    } catch {
      // ignore
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestockError(null);
    const targetSize = selectedSize || sizeEntries[0]?.[0] || 'Univerzalna';
    try {
      await subscribeRestockAlertApi({
        productId: product.id,
        size: targetSize,
        contact: restockContact,
        consentGiven: restockConsent,
      });
      setRestockSent(true);
      setRestockContact('');
    } catch (err) {
      setRestockError(err instanceof Error ? err.message : 'Greška pri prijavi.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-10">
      {/* Breadcrumb */}
      <nav aria-label="Putanja stranice" className="flex items-center gap-2 text-xs text-[#6B6862]">
        <button
          type="button"
          onClick={onBackToCatalog}
          className="inline-flex items-center gap-1.5 font-medium text-[#121212] hover:text-[#9F1239] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Nazad na katalog</span>
        </button>
        <span aria-hidden="true">/</span>
        <span className="truncate">{product.category}</span>
        <span aria-hidden="true">/</span>
        <span className="text-[#121212] font-medium truncate">{product.title}</span>
      </nav>

      {/* Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* Gallery Column */}
        <div className="lg:col-span-6 space-y-3">
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#F3F2EE] border border-[#E6E2D8]">
            <img
              src={gallery[activeImgIdx] || product.imageUrl}
              alt={product.title}
              className="w-full h-full object-cover"
            />
            {discount > 0 && (
              <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#9F1239] text-white text-xs font-semibold tabular-nums">
                -{discount}%
              </span>
            )}
            {urgencyBadge && !soldOut && (
              <span className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-white/95 text-[#9F1239] text-xs font-semibold border border-[#9F1239]/25">
                {urgencyBadge}
              </span>
            )}
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label="Uvećaj fotografiju"
              className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-white/90 border border-[#E2DDD3] text-[#121212] flex items-center justify-center shadow-sm cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {gallery.map((imgUrl, idx) => (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => setActiveImgIdx(idx)}
                  aria-label={`Prikaži sliku ${idx + 1}`}
                  className={`w-16 h-20 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                    activeImgIdx === idx ? 'border-[#121212]' : 'border-transparent opacity-70'
                  }`}
                >
                  <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details & Conversion Column */}
        <div className="lg:col-span-6 space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6862]">
              <span>
                {product.category}
                {product.brand ? ` · ${product.brand}` : ''}
                {product.color ? ` · Boja: ${product.color}` : ''}
              </span>
              {product.sku && <span className="tabular-nums">SKU: {product.sku}</span>}
            </div>

            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#121212] mt-2 leading-tight">
              {product.title}
            </h1>

            <div className="mt-3 flex items-baseline gap-3 tabular-nums">
              <span className="text-2xl font-bold text-[#121212]">
                {formatRsd(product.salePrice)}
              </span>
              {product.originalPrice > product.salePrice && (
                <span className="text-sm text-[#6B6862] line-through">
                  {formatRsd(product.originalPrice)}
                </span>
              )}
              {discount > 0 && (
                <span className="text-xs font-semibold text-[#9F1239]">
                  Ušteda {formatRsd(product.originalPrice - product.salePrice)}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-[#6B6862] leading-relaxed">{product.description}</p>

          <div className="p-3.5 rounded-xl bg-white border border-[#E6E2D8] text-xs font-medium text-[#121212]">
            {product.materialNote}
          </div>

          {/* Size Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#121212]">
                Izaberite veličinu
              </span>
              <span className="text-xs text-[#6B6862] tabular-nums">
                Ukupno raspoloživo: <strong className="text-[#121212]">{totalAvail} kom</strong>
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {sizeEntries.map(([size, qty]) => {
                const avail = qty > 0;
                const active = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={!avail}
                    onClick={() => setSelectedSize(size)}
                    className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-center transition-colors cursor-pointer ${
                      !avail
                        ? 'bg-[#F3F2EE] border-[#E6E2D8] text-[#6B6862]/45 line-through cursor-not-allowed'
                        : active
                          ? 'bg-[#121212] border-[#121212] text-white'
                          : 'bg-white border-[#D8D2C5] text-[#121212] hover:border-[#121212]'
                    }`}
                  >
                    <div className="text-xs font-bold">{size}</div>
                    <div className="text-[10px] opacity-80 tabular-nums">
                      {avail ? `još ${qty}` : 'nema'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          {!soldOut ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => selectedSize && onAddToCart(product, selectedSize)}
                  disabled={!selectedSize}
                  className="h-12 rounded-xl bg-[#121212] hover:bg-[#2A2A2A] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                  <span>Dodaj u korpu</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenOrderModal(product, selectedSize ?? undefined)}
                  className="h-12 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white text-sm font-semibold cursor-pointer"
                >
                  PORUČI ODMAH (1 korak)
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onViberOrder?.(product, selectedSize ?? undefined)}
                  className="flex-1 min-w-[165px] h-10 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Poruči preko Vibera</span>
                </button>

                <a
                  href={buildTelHref(settings.contactPhoneDisplay || settings.contactViberNumber)}
                  className="h-10 px-4 rounded-xl border border-[#9F1239]/35 bg-white hover:bg-[#9F1239] hover:text-white text-xs font-semibold text-[#9F1239] inline-flex items-center gap-1.5 transition-colors"
                >
                  <PhoneCall className="w-4 h-4" aria-hidden="true" />
                  <span>Pozovi nas</span>
                </a>

                <button
                  type="button"
                  onClick={() => onToggleWishlist(product)}
                  className="h-10 px-4 rounded-xl border border-[#E2DDD3] bg-white text-xs font-medium text-[#121212] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${isWishlisted ? 'fill-[#9F1239] text-[#9F1239]' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{isWishlisted ? 'U željama' : 'Sačuvaj'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="h-10 px-4 rounded-xl border border-[#E2DDD3] bg-white text-xs font-medium text-[#121212] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                  <span>Podeli</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E6E2D8] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#121212]">
                <Bell className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
                <span>Artikal je rasprodat — obavesti me ako ponovo stigne</span>
              </div>
              {restockSent ? (
                <p className="text-xs text-emerald-700 font-medium">
                  Prijava je sačuvana! Javićemo vam ako se pojavi na stanju (povrat ili nova serija).
                </p>
              ) : (
                <form onSubmit={handleRestockSubmit} className="space-y-2.5">
                  <input
                    type="text"
                    value={restockContact}
                    onChange={(e) => setRestockContact(e.target.value)}
                    placeholder="Telefon (06x...) ili e-mail adresa"
                    className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-xs"
                  />
                  <label className="flex items-center gap-2 text-[11px] text-[#6B6862] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restockConsent}
                      onChange={(e) => setRestockConsent(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#9F1239]"
                    />
                    <span>Slažem se da me kontaktirate isključivo kada artikal bude dostupan.</span>
                  </label>
                  {restockError && (
                    <p className="text-[11px] text-[#9F1239] font-medium">{restockError}</p>
                  )}
                  <button
                    type="submit"
                    className="h-10 px-4 rounded-lg bg-[#121212] text-white text-xs font-semibold cursor-pointer"
                  >
                    Obavesti me kada stigne
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Delivery & Size Guide */}
          <div className="bg-white border border-[#E6E2D8] rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-[#121212]">
              <Truck className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
              <span>
                Post Express isporuka (24–48h) · {formatRsd(settings.shippingCostRsd)} (besplatno preko{' '}
                {formatRsd(settings.freeShippingThresholdRsd)} ili 3 komada)
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#121212]">
              <ShieldCheck className="w-4 h-4 text-[#C5A059]" aria-hidden="true" />
              <span>Plaćanje pouzećem gotovinom · Zamena veličine moguća u roku od 14 dana</span>
            </div>

            <div className="pt-2 border-t border-[#F0ECE3]">
              <button
                type="button"
                onClick={() => setShowSizeGuide((p) => !p)}
                className="w-full flex items-center justify-between font-semibold text-[#121212] cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
                  Tabela veličina
                </span>
                {showSizeGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showSizeGuide && (
                <div className="mt-2 space-y-2 text-[11px]">
                  <table className="w-full text-left tabular-nums">
                    <thead>
                      {product.sizeGuideType === 'bebe' ? (
                        <tr className="text-[#6B6862] border-b border-[#E6E2D8]">
                          <th className="py-1">Uzrast</th>
                          <th className="py-1">Visina</th>
                          <th className="py-1">Težina</th>
                          <th />
                        </tr>
                      ) : (
                        <tr className="text-[#6B6862] border-b border-[#E6E2D8]">
                          <th className="py-1">Vel.</th>
                          <th className="py-1">Grudi</th>
                          <th className="py-1">Struk</th>
                          <th className="py-1">Kukovi</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-[#EFECE4]">
                      {(product.sizeGuideType === 'bebe' ? [] : ADULT_SIZE_GUIDE_ROWS).map((r) => (
                        <tr key={r.size}>
                          <td className="py-1 font-semibold">{r.size}</td>
                          <td className="py-1">{r.chest}</td>
                          <td className="py-1">{r.waist}</td>
                          <td className="py-1">{r.hips}</td>
                        </tr>
                      ))}
                      {product.sizeGuideType === 'bebe' &&
                        BABY_SIZE_GUIDE_ROWS.map((r) => (
                          <tr key={r.age}>
                            <td className="py-1 font-semibold">{r.age}</td>
                            <td className="py-1">{r.height}</td>
                            <td className="py-1">{r.weight}</td>
                            <td />
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Similar Products */}
      {similarProducts.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-[#E6E2D8]">
          <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-[#121212]">
            Slični dostupni artikli
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
            {similarProducts.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                isWishlisted={wishlistIds.includes(item.id)}
                onToggleWishlist={onToggleWishlist}
                onOpenProductPage={onOpenProductPage}
                onOpenOrderModal={onOpenOrderModal}
                onQuickAddToCart={onAddToCart}
                onViberOrder={onViberOrder}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently Viewed */}
      {recentlyViewedProducts.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-[#E6E2D8]">
          <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-[#121212]">
            Nedavno pregledano
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
            {recentlyViewedProducts.slice(0, 4).map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                isWishlisted={wishlistIds.includes(item.id)}
                onToggleWishlist={onToggleWishlist}
                onOpenProductPage={onOpenProductPage}
                onOpenOrderModal={onOpenOrderModal}
                onQuickAddToCart={onAddToCart}
                onViberOrder={onViberOrder}
              />
            ))}
          </div>
        </section>
      )}

      {/* Fullscreen Zoom Lightbox */}
      {zoomOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Uvećana fotografija artikla"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Zatvori uvećanu fotografiju"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white text-[#121212] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={gallery[activeImgIdx] || product.imageUrl}
            alt={product.title}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
