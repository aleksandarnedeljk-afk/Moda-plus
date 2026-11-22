import { ArrowUpDown, Search, Share2, SlidersHorizontal, X } from 'lucide-react';
import {
  CATEGORY_FILTERS,
  SIZE_FILTERS,
  SORT_OPTIONS,
} from '../config/storeConfig';
import type {
  AutoCollectionFilter,
  CategoryConfig,
  CategoryFilter,
  SizeFilter,
  SortOption,
} from '../types/store';

interface FilterBarProps {
  categories?: CategoryConfig[];
  selectedCategory: CategoryFilter;
  onSelectCategory: (category: CategoryFilter) => void;
  selectedSize: SizeFilter;
  onSelectSize: (size: SizeFilter) => void;
  selectedCollection: AutoCollectionFilter;
  onSelectCollection: (collection: AutoCollectionFilter) => void;
  onlyAvailable: boolean;
  onToggleOnlyAvailable: () => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalMatching: number;
  activeFilterCount: number;
  onResetFilters: () => void;
  onShareFiltered?: () => void;
}

const COLLECTION_PILLS: { value: AutoCollectionFilter; label: string }[] = [
  { value: 'all', label: 'Sve kolekcije' },
  { value: 'new', label: 'Novo u ponudi' },
  { value: 'last-piece', label: 'Poslednji komad (1)' },
  { value: 'top-discount', label: 'Najveći popusti (-50%+)' },
  { value: 'under-999', label: 'Do 999 RSD' },
  { value: 'under-1499', label: 'Do 1.499 RSD' },
  { value: 'under-1999', label: 'Do 1.999 RSD' },
  { value: 'under-2999', label: 'Do 2.999 RSD' },
  { value: 'bestselling', label: 'Najprodavaniji' },
];

export function FilterBar({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedSize,
  onSelectSize,
  selectedCollection,
  onSelectCollection,
  onlyAvailable,
  onToggleOnlyAvailable,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  totalMatching,
  activeFilterCount,
  onResetFilters,
  onShareFiltered,
}: FilterBarProps) {
  const categoryList: CategoryFilter[] =
    categories && categories.length > 0
      ? ['Sve', ...categories.map((c) => c.name)]
      : CATEGORY_FILTERS;

  return (
    <div id="katalog" className="border-b border-[#E6E2D8] bg-[#FAF9F6]">
      {/* Mobile Search Input */}
      <div className="md:hidden max-w-7xl mx-auto px-4 pt-2 pb-2">
        <div className="relative flex items-center">
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
            className="w-full h-11 pl-10 pr-9 bg-white border border-[#E2DDD3] rounded-full text-sm text-[#121212] placeholder:text-[#6B6862]/80 focus:outline-none focus:border-[#121212]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Obriši pretragu"
              className="absolute right-2.5 w-7 h-7 flex items-center justify-center rounded-full text-[#6B6862]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sticky Discovery Strip */}
      <div className="sticky top-14 sm:top-[68px] z-20 bg-[#FAF9F6]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 space-y-2">
          {/* Row 1: Category Pills + Sort Dropdown */}
          <div className="flex items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Kategorije proizvoda"
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1"
            >
              {categoryList.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => onSelectCategory(category)}
                    aria-pressed={active}
                    className={`h-9 sm:h-10 px-3.5 sm:px-4 rounded-full text-xs sm:text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#121212] text-white'
                        : 'bg-white text-[#121212] border border-[#E2DDD3] hover:border-[#121212]'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#6B6862]" aria-hidden="true" />
              <label htmlFor="desktop-sort" className="sr-only">
                Sortiraj artikle
              </label>
              <select
                id="desktop-sort"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="h-10 pl-3 pr-8 bg-white border border-[#E2DDD3] rounded-full text-xs sm:text-[13px] font-medium text-[#121212] focus:outline-none focus:border-[#121212] cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Automatic Collections + Size Filter Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Filter po veličini"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B6862] mr-1 shrink-0">
                <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                Veličina:
              </span>
              {SIZE_FILTERS.map((size) => {
                const active = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onSelectSize(size)}
                    aria-pressed={active}
                    className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#9F1239] text-white'
                        : 'bg-[#F3F2EE] text-[#121212] hover:bg-[#E7E3DA]'
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onToggleOnlyAvailable}
                aria-pressed={onlyAvailable}
                className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                  onlyAvailable
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-white border-[#E2DDD3] text-[#121212]'
                }`}
              >
                {onlyAvailable ? '✓ Samo dostupno' : 'Samo na stanju'}
              </button>

              <span className="text-xs text-[#6B6862] tabular-nums whitespace-nowrap">
                <strong className="text-[#121212]">{totalMatching}</strong> art.
              </span>

              {onShareFiltered && activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={onShareFiltered}
                  aria-label="Podeli filtriranu ponudu"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#121212] hover:text-[#9F1239] cursor-pointer whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">Podeli</span>
                </button>
              )}

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="text-xs font-medium text-[#9F1239] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Poništi
                </button>
              )}

              <div className="sm:hidden">
                <label htmlFor="mobile-sort" className="sr-only">
                  Sortiraj artikle
                </label>
                <select
                  id="mobile-sort"
                  value={sortBy}
                  onChange={(e) => onSortChange(e.target.value as SortOption)}
                  className="h-8 px-2 bg-white border border-[#E2DDD3] rounded-lg text-xs font-medium text-[#121212]"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Automatic Price & Clearance Collections Strip */}
          <div
            role="group"
            aria-label="Akcijske kolekcije"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
          >
            {COLLECTION_PILLS.map((pill) => {
              const active = selectedCollection === pill.value;
              return (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => onSelectCollection(pill.value)}
                  aria-pressed={active}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#C5A059] text-[#121212] font-semibold'
                      : 'bg-white/80 text-[#6B6862] border border-[#E6E2D8] hover:text-[#121212]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
