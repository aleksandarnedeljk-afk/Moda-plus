import { Heart, MessageCircle, PhoneCall, Search, ShoppingBag, Truck, X } from 'lucide-react';
import { STORE_CONFIG } from '../config/storeConfig';
import { buildTelHref, buildViberDirectChatUrl } from '../utils/viberLogic';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  brandName?: string;
  brandSubtitle?: string;
  logoMonogram?: string;
  contactPhoneDisplay?: string;
  contactViberNumber?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  wishlistCount: number;
  cartCount: number;
  onOpenWishlist: () => void;
  onOpenCart: () => void;
  onOpenTrackingModal: () => void;
  onNavigateHome: () => void;
}

export function Header({
  brandName,
  brandSubtitle,
  logoMonogram,
  contactPhoneDisplay,
  contactViberNumber,
  searchQuery,
  onSearchChange,
  activeFilterCount,
  onClearFilters,
  wishlistCount,
  cartCount,
  onOpenWishlist,
  onOpenCart,
  onOpenTrackingModal,
  onNavigateHome,
}: HeaderProps) {
  const displayPhone = contactPhoneDisplay || STORE_CONFIG.contactPhoneDisplay;
  const viberHref = buildViberDirectChatUrl(contactViberNumber || displayPhone);
  const telHref = buildTelHref(displayPhone);

  return (
    <header className="sticky top-0 z-30 bg-[#FAF9F6]/92 backdrop-blur-md border-b border-[#E6E2D8]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-[68px] flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Minimalist Editorial Brand Logo */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigateHome();
          }}
          className="shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F1239] rounded-md"
        >
          <BrandLogo
            brandName={brandName || STORE_CONFIG.brandName}
            brandSubtitle={brandSubtitle || STORE_CONFIG.brandSubtitle}
            logoMonogram={logoMonogram || STORE_CONFIG.logoMonogram}
            variant="light"
            size="md"
            showSubtitle
          />
        </a>

        {/* Center: Live Instant Search (Desktop & Tablet) */}
        <div className="hidden md:flex flex-1 max-w-sm items-center relative">
          <Search
            className="w-4 h-4 text-[#6B6862] absolute left-3.5 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pretraži haljine, dukseve, pantalone, bebi program..."
            aria-label="Pretraži artikle"
            className="w-full h-10 pl-10 pr-9 bg-white border border-[#E2DDD3] rounded-full text-sm text-[#121212] placeholder:text-[#6B6862]/80 focus:outline-none focus:border-[#121212] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Obriši pretragu"
              className="absolute right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-[#6B6862] hover:text-[#121212] hover:bg-[#F3F2EE]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Contact + Active Filter Counter + Wishlist + Cart + Praćenje */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              aria-label={`Poništi aktivne filtere (${activeFilterCount})`}
              className="hidden xl:inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#F3F2EE] hover:bg-[#E7E3DA] text-xs font-medium text-[#121212] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Filteri ({activeFilterCount})</span>
              <X className="w-3.5 h-3.5 text-[#6B6862]" aria-hidden="true" />
            </button>
          )}

          <a
            href={viberHref}
            aria-label={`Viber kontakt (${displayPhone})`}
            title={`Viber: ${displayPhone}`}
            className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#7360F2]/10 hover:bg-[#7360F2] text-[#5E4BD8] hover:text-white border border-[#7360F2]/25 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Viber</span>
          </a>

          <a
            href={telHref}
            aria-label={`Pozovi nas (${displayPhone})`}
            title={`Pozovi nas: ${displayPhone}`}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-full border border-[#E2DDD3] bg-white hover:border-[#9F1239] text-xs font-semibold text-[#121212] transition-colors whitespace-nowrap shrink-0"
          >
            <PhoneCall className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
            <span className="hidden xl:inline tabular-nums">{displayPhone}</span>
            <span className="xl:hidden">Pozovi nas</span>
          </a>

          <button
            type="button"
            onClick={onOpenWishlist}
            aria-label={`Lista želja (${wishlistCount})`}
            className="inline-flex items-center justify-center gap-1 h-9 sm:h-10 px-2.5 sm:px-3 rounded-full border border-[#E2DDD3] bg-white hover:border-[#121212] text-xs sm:text-sm font-medium text-[#121212] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Heart
              className={`w-4 h-4 ${
                wishlistCount > 0 ? 'fill-[#9F1239] text-[#9F1239]' : 'text-[#121212]'
              }`}
              aria-hidden="true"
            />
            <span className="hidden 2xl:inline">Želje</span>
            {wishlistCount > 0 && (
              <span className="text-[11px] font-bold text-[#9F1239] tabular-nums">
                {wishlistCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`Korpa (${cartCount})`}
            className={`inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full border text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              cartCount > 0
                ? 'bg-[#121212] border-[#121212] text-white'
                : 'bg-white border-[#E2DDD3] text-[#121212] hover:border-[#121212]'
            }`}
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Korpa</span>
            <span className="text-[11px] tabular-nums">({cartCount})</span>
          </button>

          <button
            type="button"
            onClick={onOpenTrackingModal}
            aria-label="Praćenje porudžbine i kontakt"
            className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-full border border-[#121212]/20 bg-white hover:border-[#121212] text-xs font-medium text-[#121212] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
            <span className="hidden sm:inline">Praćenje</span>
          </button>
        </div>
      </div>
    </header>
  );
}
