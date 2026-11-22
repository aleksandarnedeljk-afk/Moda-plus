import { ArrowDownRight } from 'lucide-react';
import { STORE_CONFIG } from '../config/storeConfig';
import type { CategoryConfig, CategoryFilter, StoreSettings } from '../types/store';

interface HeroBannerProps {
  settings?: StoreSettings;
  categories?: CategoryConfig[];
  activeCatalogCount: number;
  totalPiecesCount: number;
  onSelectCategory: (category: CategoryFilter) => void;
  onScrollToCatalog: () => void;
}

export function HeroBanner({
  settings,
  categories,
  activeCatalogCount,
  totalPiecesCount,
  onSelectCategory,
  onScrollToCatalog,
}: HeroBannerProps) {
  const quickCategories: { label: string; category: CategoryFilter }[] =
    categories && categories.length > 0
      ? categories.slice(0, 4).map((c) => ({ label: c.name, category: c.name }))
      : [
          { label: 'Ženske haljine', category: 'Ženske haljine' },
          { label: 'Majice i duksevi', category: 'Majice i duksevi' },
          { label: 'Pantalone i farmerke', category: 'Pantalone i farmerke' },
          { label: 'Za bebe (0–24m)', category: 'Za bebe (odelca i čarapice)' },
        ];

  const heroTitle = settings?.heroTitle || 'Velika rasprodaja zaliha';
  const secondarySlogan =
    settings?.secondarySlogan || 'Moda za celu porodicu po outlet cenama.';
  const heroSubtitle =
    settings?.heroSubtitle ||
    'Odličan stil. Još bolje cene. Potpuno novi komadi sa originalnom etiketom u ograničenim veličinama, plaćanje pouzećem i brza Post Express dostava.';
  const heroImageUrl = settings?.heroImageUrl || STORE_CONFIG.heroImageUrl;
  const freeThreshold = settings?.freeShippingThresholdRsd ?? STORE_CONFIG.freeShippingThresholdRsd;

  return (
    <section
      aria-label="Istaknuta outlet ponuda"
      className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 sm:pt-6 pb-3 sm:pb-6"
    >
      <div className="relative overflow-hidden rounded-2xl bg-[#121212] border border-[#E6E2D8]">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Left Editorial Copy */}
          <div className="lg:col-span-6 p-4 sm:p-8 lg:p-10 flex flex-col justify-between bg-[#FAF9F6] text-[#121212]">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-medium tracking-wide text-[#6B6862]">
                <span className="text-[#9F1239] font-semibold">Do -60% popusta</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {activeCatalogCount} dostupnih modela ({totalPiecesCount} kom)
                </span>
                <span aria-hidden="true">·</span>
                <span>{secondarySlogan}</span>
              </div>

              <h1 className="font-editorial text-[clamp(1.45rem,3.6vw,3rem)] font-semibold leading-[1.12] tracking-tight text-[#121212] mt-2 sm:mt-3 text-balance">
                {heroTitle}
              </h1>

              <p className="text-xs sm:text-[15px] text-[#6B6862] leading-relaxed mt-2 sm:mt-3 max-w-xl">
                {heroSubtitle}
              </p>
            </div>

            {/* Quick-Jump Category Buttons */}
            <div className="mt-4 sm:mt-6 pt-3.5 sm:pt-5 border-t border-[#E6E2D8]">
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar sm:flex-wrap">
                {quickCategories.map((item) => (
                  <button
                    key={item.category}
                    type="button"
                    onClick={() => {
                      onSelectCategory(item.category);
                      onScrollToCatalog();
                    }}
                    className="h-9 sm:h-10 px-3 sm:px-3.5 rounded-full border border-[#D8D2C5] bg-white hover:border-[#121212] hover:bg-[#121212] hover:text-white text-xs sm:text-[13px] font-medium text-[#121212] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory('Sve');
                    onScrollToCatalog();
                  }}
                  className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-3.5 sm:px-4 rounded-full bg-[#9F1239] hover:bg-[#881337] text-white text-xs sm:text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Cela ponuda</span>
                  <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Editorial Photography */}
          <div className="lg:col-span-6 relative h-40 sm:h-64 lg:h-auto lg:min-h-[360px] bg-[#F3F2EE]">
            <img
              src={heroImageUrl}
              alt={`${settings?.brandName || 'MODA PLUS OUTLET'} kolekcija haljina, pletiva i kaputa u salonu`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center lg:absolute lg:inset-0"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent lg:bg-gradient-to-r lg:from-black/25 lg:via-transparent lg:to-transparent"
              aria-hidden="true"
            />
            <div className="absolute bottom-2.5 left-3 right-3 sm:bottom-5 sm:left-5 flex items-center justify-between text-white text-[11px] sm:text-xs">
              <span className="font-medium tracking-wide bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-full">
                Post Express dostava za 24–48h
              </span>
              <span className="hidden sm:inline-flex font-medium bg-black/55 backdrop-blur-sm px-3 py-1.5 rounded-full tabular-nums">
                Besplatna dostava &gt; {freeThreshold.toLocaleString('sr-RS')} RSD
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
