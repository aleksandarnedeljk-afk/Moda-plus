import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { AnnouncementBar } from './components/AnnouncementBar';
import { CartDrawer } from './components/CartDrawer';
import {
  CONSENT_BANNER_STORAGE_KEY,
  ConsentBanner,
} from './components/ConsentBanner';
import { FilterBar } from './components/FilterBar';
import { FloatingViberWidget } from './components/FloatingViberWidget';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { LegalPageView } from './components/LegalPageView';
import { OrderModal } from './components/OrderModal';
import { ProductGrid } from './components/ProductGrid';
import { ProductPage } from './components/ProductPage';
import { OfflineIndicator } from './components/PWAInstallUI';
import { ReviewsSection } from './components/ReviewsSection';
import { ToastContainer } from './components/ToastContainer';
import { TrackingInfoModal } from './components/TrackingInfoModal';
import {
  ViberFallbackModal,
  type ViberModalPayload,
} from './components/ViberFallbackModal';
import { WishlistDrawer } from './components/WishlistDrawer';
import {
  DEFAULT_LEGAL_PAGES,
  DEFAULT_STORE_SETTINGS,
  STORE_CONFIG,
} from './config/storeConfig';
import type {
  AutoCollectionFilter,
  CartItem,
  CategoryConfig,
  CategoryFilter,
  LegalPageRecord,
  Product,
  ProductSize,
  PromotionRule,
  ReviewItem,
  SizeFilter,
  SortOption,
  StoreSettings,
} from './types/store';
import { fetchProductBySlugOrId, fetchStorefront } from './utils/api';
import {
  CART_STORAGE_KEY,
  computeCartTotals,
  getVariantAvailableStock,
  parseCartShareParam,
  RECENTLY_VIEWED_STORAGE_KEY,
} from './utils/cartAndPromoLogic';
import {
  buildStoreQueryParams,
  filterAndSortProducts,
  formatRsd,
  getProductPath,
  getTotalStock,
  isProductPubliclyActive,
  parseStoreQueryParams,
} from './utils/storeLogic';
import { buildDetailedProductViberMessage } from './utils/viberLogic';
import {
  createToastItem,
  enqueueToast,
  getWishlistProducts,
  toggleWishlistItem,
  WISHLIST_STORAGE_KEY,
  type ToastMessage,
} from './utils/wishlistAndToast';

const LEGAL_SLUGS = new Set([
  'o-nama',
  'kontakt',
  'uslovi-kupovine',
  'politika-privatnosti',
  'dostava-i-placanje',
  'reklamacije',
  'povracaj-robe',
  'odustanak-od-kupovine',
]);

export default function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [legalPages, setLegalPages] = useState<LegalPageRecord[]>(DEFAULT_LEGAL_PAGES);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [promotions, setPromotions] = useState<PromotionRule[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initialQuery = useMemo(
    () => parseStoreQueryParams(window.location.search),
    [],
  );

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(
    initialQuery.category,
  );
  const [selectedSize, setSelectedSize] = useState<SizeFilter>(initialQuery.size);
  const [selectedCollection, setSelectedCollection] = useState<AutoCollectionFilter>(
    initialQuery.collection,
  );
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(initialQuery.onlyAvailable);
  const [sortBy, setSortBy] = useState<SortOption>(initialQuery.sort);
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery.query);
  const [visibleBatchSize, setVisibleBatchSize] = useState<number>(
    STORE_CONFIG.itemsPerBatch,
  );

  const [orderModalProduct, setOrderModalProduct] = useState<Product | null>(null);
  const [orderModalInitialSize, setOrderModalInitialSize] = useState<
    ProductSize | undefined
  >(undefined);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState<boolean>(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState<boolean>(false);
  const [viberModalPayload, setViberModalPayload] = useState<ViberModalPayload | null>(null);
  const [isConsentPending, setIsConsentPending] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONSENT_BANNER_STORAGE_KEY) === null;
    } catch {
      return false;
    }
  });
  const [fetchedSingleProduct, setFetchedSingleProduct] = useState<Product | null>(null);

  // Wishlist persisted in localStorage
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  // Cart persisted in localStorage (and imported via ?korpa=...)
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    const sharedCart = parseCartShareParam(
      new URLSearchParams(window.location.search).get('korpa'),
    );
    if (sharedCart.length > 0) return sharedCart;
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Recently viewed product IDs persisted in localStorage
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  // Luxury Toast Queue
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  const isAdminRoute = pathname.startsWith('/admin');
  const isProductRoute = pathname.startsWith('/artikal/');
  const cleanSlug = pathname.replace(/^\/+|\/+$/g, '');
  const isLegalRoute = LEGAL_SLUGS.has(cleanSlug);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: Parameters<typeof createToastItem>[0], durationMs: number = 4200) => {
      const nextToast = createToastItem(input);
      setToasts((prev) => enqueueToast(prev, nextToast, 3));
      const timer = window.setTimeout(() => {
        dismissToast(nextToast.id);
      }, durationMs);
      toastTimersRef.current.set(nextToast.id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timersMap = toastTimersRef.current;
    return () => {
      timersMap.forEach((timer) => window.clearTimeout(timer));
      timersMap.clear();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlistIds));
    } catch {
      // ignore storage quota errors
    }
  }, [wishlistIds]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // ignore storage quota errors
    }
  }, [cartItems]);

  useEffect(() => {
    try {
      localStorage.setItem(
        RECENTLY_VIEWED_STORAGE_KEY,
        JSON.stringify(recentlyViewedIds.slice(0, 10)),
      );
    } catch {
      // ignore storage quota errors
    }
  }, [recentlyViewedIds]);

  const loadStorefront = useCallback(async () => {
    setIsLoadingProducts(true);
    setLoadError(null);
    try {
      const data = await fetchStorefront();
      setProducts(data.products);
      setCategories(data.categories);
      setLegalPages(data.legalPages);
      setSettings(data.settings);
      setPromotions(data.promotions);
      setReviews(data.reviews);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Greška pri učitavanju kataloga.',
      );
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void loadStorefront();
  }, [loadStorefront]);

  // Open Cart Drawer automatically if arrived via shared ?korpa=... link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('korpa')) {
      setIsCartOpen(true);
    }
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname;
      setPathname(nextPath);
      if (nextPath === '/' || nextPath === '') {
        const availableNames =
          categories.length > 0 ? ['Sve', ...categories.map((c) => c.name)] : undefined;
        const parsed = parseStoreQueryParams(window.location.search, availableNames);
        setSelectedCategory(parsed.category);
        setSelectedSize(parsed.size);
        setSelectedCollection(parsed.collection);
        setOnlyAvailable(parsed.onlyAvailable);
        setSortBy(parsed.sort);
        setSearchQuery(parsed.query);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [categories]);

  // Sync Storefront Filters with URL Query Params ONLY when on Home `/` route
  useEffect(() => {
    if (pathname !== '/' && pathname !== '') return;
    const queryStr = buildStoreQueryParams({
      category: selectedCategory,
      size: selectedSize,
      sort: sortBy,
      query: searchQuery,
      collection: selectedCollection,
      onlyAvailable,
    });
    const nextUrl = `/${queryStr}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    // Don't strip ?korpa= while cart drawer is just opening on initial load
    if (!window.location.search.includes('korpa=') && nextUrl !== currentUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [
    pathname,
    selectedCategory,
    selectedSize,
    sortBy,
    searchQuery,
    selectedCollection,
    onlyAvailable,
  ]);

  const navigateTo = useCallback((targetPath: string) => {
    window.history.pushState({}, '', targetPath);
    setPathname(targetPath.split('?')[0] || '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Resolve ProductPage slugOrId
  const productSlugOrId = isProductRoute ? pathname.replace(/^\/artikal\//, '').split('/')[0] : null;
  const activePageProduct = useMemo(() => {
    if (!productSlugOrId) return null;
    const match = products.find(
      (p) =>
        p.id === productSlugOrId ||
        p.slug === productSlugOrId ||
        productSlugOrId.endsWith(`-${p.id}`),
    );
    if (match) return match;
    if (
      fetchedSingleProduct &&
      (fetchedSingleProduct.id === productSlugOrId ||
        fetchedSingleProduct.slug === productSlugOrId ||
        productSlugOrId.endsWith(`-${fetchedSingleProduct.id}`))
    ) {
      return fetchedSingleProduct;
    }
    return null;
  }, [productSlugOrId, products, fetchedSingleProduct]);

  useEffect(() => {
    if (!productSlugOrId || activePageProduct || isLoadingProducts) return;
    void fetchProductBySlugOrId(productSlugOrId)
      .then((prod) => setFetchedSingleProduct(prod))
      .catch(() => undefined);
  }, [productSlugOrId, activePageProduct, isLoadingProducts]);

  // Update recently viewed list when viewing a product page
  useEffect(() => {
    if (!activePageProduct) return;
    setRecentlyViewedIds((prev) =>
      [activePageProduct.id, ...prev.filter((id) => id !== activePageProduct.id)].slice(0, 10),
    );
  }, [activePageProduct]);

  const recentlyViewedProducts = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return recentlyViewedIds
      .map((id) => map.get(id))
      .filter((p): p is Product => Boolean(p));
  }, [products, recentlyViewedIds]);

  const handleResetFilters = () => {
    setSelectedCategory('Sve');
    setSelectedSize('Sve veličine');
    setSelectedCollection('all');
    setOnlyAvailable(false);
    setSortBy('newest');
    setSearchQuery('');
    setVisibleBatchSize(STORE_CONFIG.itemsPerBatch);
  };

  const handleCategoryChange = (cat: CategoryFilter) => {
    setSelectedCategory(cat);
    setVisibleBatchSize(STORE_CONFIG.itemsPerBatch);
  };

  const handleSizeChange = (size: SizeFilter) => {
    setSelectedSize(size);
    setVisibleBatchSize(STORE_CONFIG.itemsPerBatch);
  };

  const handleCollectionChange = (col: AutoCollectionFilter) => {
    setSelectedCollection(col);
    setVisibleBatchSize(STORE_CONFIG.itemsPerBatch);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setVisibleBatchSize(STORE_CONFIG.itemsPerBatch);
  };

  const handleToggleWishlist = (product: Product) => {
    const { nextIds, added } = toggleWishlistItem(wishlistIds, product.id);
    setWishlistIds(nextIds);
    if (added) {
      pushToast({
        kind: 'wishlist-add',
        title: 'Sačuvano u listu želja',
        message: product.title,
        actionLabel: 'Pogledaj listu želja',
        onAction: () => setIsWishlistOpen(true),
      });
    } else {
      pushToast({
        kind: 'wishlist-remove',
        title: 'Uklonjeno iz liste želja',
        message: product.title,
      });
    }
  };

  const handleAddToCart = (product: Product, size: ProductSize) => {
    const maxAvail = getVariantAvailableStock(product, size);
    if (maxAvail <= 0) {
      pushToast({
        kind: 'info',
        title: 'Veličina nije dostupna',
        message: `${product.title} (${size}) je trenutno rasprodato.`,
      });
      return;
    }

    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id && i.size === size);
      if (idx >= 0) {
        const currentQty = prev[idx].quantity;
        if (currentQty >= maxAvail) {
          return prev;
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: currentQty + 1 };
        return copy;
      }
      return [...prev, { productId: product.id, size, quantity: 1 }];
    });

    pushToast({
      kind: 'info',
      title: 'Dodato u korpu',
      message: `${product.title} (${size})`,
      actionLabel: 'Otvori korpu',
      onAction: () => setIsCartOpen(true),
    });
  };

  const handleUpdateCartQty = (productId: string, size: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCartItems((prev) =>
        prev.filter((i) => !(i.productId === productId && i.size === size)),
      );
      return;
    }
    const product = products.find((p) => p.id === productId);
    const maxAvail = product ? getVariantAvailableStock(product, size) : nextQty;
    const clamped = Math.min(nextQty, Math.max(1, maxAvail));
    setCartItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.size === size ? { ...i, quantity: clamped } : i,
      ),
    );
  };

  const handleRemoveCartItem = (productId: string, size: string) => {
    setCartItems((prev) =>
      prev.filter((i) => !(i.productId === productId && i.size === size)),
    );
  };

  const cartSummary = useMemo(
    () =>
      computeCartTotals({
        cartItems,
        products,
        settings,
        promotions,
      }),
    [cartItems, products, settings, promotions],
  );

  const activeFilterCount =
    (selectedCategory !== 'Sve' ? 1 : 0) +
    (selectedSize !== 'Sve veličine' ? 1 : 0) +
    (selectedCollection !== 'all' ? 1 : 0) +
    (onlyAvailable ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const filteredProducts = useMemo(
    () =>
      filterAndSortProducts(products, {
        category: selectedCategory,
        size: selectedSize,
        sort: sortBy,
        query: searchQuery,
        collection: selectedCollection,
        onlyAvailable,
        showSoldOut: settings.showSoldOutProducts,
      }),
    [
      products,
      selectedCategory,
      selectedSize,
      sortBy,
      searchQuery,
      selectedCollection,
      onlyAvailable,
      settings.showSoldOutProducts,
    ],
  );

  const paginatedProducts = useMemo(
    () => filteredProducts.slice(0, visibleBatchSize),
    [filteredProducts, visibleBatchSize],
  );

  const wishlistProducts = useMemo(
    () => getWishlistProducts(products, wishlistIds),
    [products, wishlistIds],
  );

  const activeStats = useMemo(() => {
    const publicActive = products.filter(
      (p) => isProductPubliclyActive(p) && getTotalStock(p.stockBySize, p.variants) > 0,
    );
    const totalPieces = publicActive.reduce(
      (sum, p) => sum + getTotalStock(p.stockBySize, p.variants),
      0,
    );
    return { activeCatalogCount: publicActive.length, totalPiecesCount: totalPieces };
  }, [products]);

  const handleScrollToCatalog = () => {
    const el = document.getElementById('katalog');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenProductViber = useCallback(
    (prod: Product, preselectedSize?: ProductSize) => {
      const prepared = buildDetailedProductViberMessage({
        brandName: settings.brandName,
        product: prod,
        size: preselectedSize,
        quantity: 1,
        unitOrTotalPriceRsd: prod.salePrice,
      });
      setViberModalPayload({
        title: 'Poruči preko Vibera',
        subtitle: `${prod.title}${preselectedSize ? ` · Veličina ${preselectedSize}` : ''}`,
        message: prepared,
      });
    },
    [settings.brandName],
  );

  if (isAdminRoute) {
    return (
      <AdminPanel
        onStorefrontRefresh={() => {
          void loadStorefront();
        }}
        onBackToStore={() => {
          void loadStorefront();
          navigateTo('/');
        }}
      />
    );
  }

  const activeLegalPage = isLegalRoute
    ? legalPages.find((p) => p.slug === cleanSlug) || DEFAULT_LEGAL_PAGES[0]
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#121212]">
      <AnnouncementBar
        text={settings.announcementText}
        holidayBannerActive={settings.holidayBannerActive}
        holidayBannerText={settings.holidayBannerText}
      />

      <Header
        brandName={settings.brandName}
        brandSubtitle={settings.brandSubtitle}
        logoMonogram={settings.logoMonogram}
        contactPhoneDisplay={settings.contactPhoneDisplay}
        contactViberNumber={settings.contactViberNumber}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          handleSearchChange(q);
          if (pathname !== '/') navigateTo('/');
        }}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleResetFilters}
        wishlistCount={wishlistProducts.length}
        cartCount={cartSummary.totalPieces}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTrackingModal={() => setIsTrackingModalOpen(true)}
        onNavigateHome={() => {
          handleResetFilters();
          navigateTo('/');
        }}
      />

      <main className="flex-1">
        {isProductRoute ? (
          activePageProduct ? (
            <ProductPage
              product={activePageProduct}
              allProducts={products}
              recentlyViewedProducts={recentlyViewedProducts}
              settings={settings}
              wishlistIds={wishlistIds}
              onBackToCatalog={() => navigateTo('/')}
              onToggleWishlist={handleToggleWishlist}
              onAddToCart={handleAddToCart}
              onOpenOrderModal={(prod, preselectedSize) => {
                setOrderModalProduct(prod);
                setOrderModalInitialSize(preselectedSize);
              }}
              onViberOrder={handleOpenProductViber}
              onOpenProductPage={(prod) => navigateTo(getProductPath(prod))}
              onShareProductCopied={() => {
                pushToast({
                  kind: 'info',
                  title: 'Link artikla kopiran',
                  message: activePageProduct.title,
                });
              }}
            />
          ) : isLoadingProducts ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 animate-pulse">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-6 aspect-[3/4] rounded-2xl bg-[#EFECE5]" />
                <div className="lg:col-span-6 space-y-4">
                  <div className="h-6 w-1/3 bg-[#EFECE5] rounded" />
                  <div className="h-10 w-3/4 bg-[#EFECE5] rounded" />
                  <div className="h-24 w-full bg-[#EFECE5] rounded" />
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
              <h1 className="font-editorial text-2xl font-semibold">
                Artikal nije pronađen
              </h1>
              <p className="text-sm text-[#6B6862]">
                Moguće je da je artikal rasprodat ili uklonjen iz ponude.
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="h-11 px-6 rounded-full bg-[#121212] text-white text-xs font-semibold cursor-pointer"
              >
                Nazad na katalog
              </button>
            </div>
          )
        ) : activeLegalPage ? (
          <LegalPageView
            page={activeLegalPage}
            allPages={legalPages}
            settings={settings}
            onNavigatePage={(slug) => navigateTo(`/${slug}`)}
            onBackHome={() => navigateTo('/')}
          />
        ) : (
          <>
            <HeroBanner
              settings={settings}
              categories={categories}
              activeCatalogCount={activeStats.activeCatalogCount}
              totalPiecesCount={activeStats.totalPiecesCount}
              onSelectCategory={handleCategoryChange}
              onScrollToCatalog={handleScrollToCatalog}
            />

            <FilterBar
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={handleCategoryChange}
              selectedSize={selectedSize}
              onSelectSize={handleSizeChange}
              selectedCollection={selectedCollection}
              onSelectCollection={handleCollectionChange}
              onlyAvailable={onlyAvailable}
              onToggleOnlyAvailable={() => setOnlyAvailable((prev) => !prev)}
              sortBy={sortBy}
              onSortChange={setSortBy}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              totalMatching={filteredProducts.length}
              activeFilterCount={activeFilterCount}
              onResetFilters={handleResetFilters}
              onShareFiltered={() => {
                navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                pushToast({
                  kind: 'info',
                  title: 'Link filtrirane ponude kopiran',
                  message: 'Možete ga podeliti na Viberu ili društvenim mrežama.',
                });
              }}
            />

            {loadError ? (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 text-center">
                <p className="text-sm text-[#9F1239] font-medium">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void loadStorefront()}
                  className="mt-4 h-10 px-5 rounded-full bg-[#121212] text-white text-xs font-semibold cursor-pointer"
                >
                  Pokušaj ponovo
                </button>
              </div>
            ) : (
              <ProductGrid
                products={paginatedProducts}
                totalFilteredCount={filteredProducts.length}
                isLoading={isLoadingProducts}
                wishlistIds={wishlistIds}
                onToggleWishlist={handleToggleWishlist}
                onLoadMore={() =>
                  setVisibleBatchSize((prev) => prev + STORE_CONFIG.itemsPerBatch)
                }
                onResetFilters={handleResetFilters}
                onOpenProductPage={(product) => navigateTo(getProductPath(product))}
                onOpenOrderModal={(product, preselectedSize) => {
                  setOrderModalProduct(product);
                  setOrderModalInitialSize(preselectedSize);
                }}
                onViberOrder={handleOpenProductViber}
                onQuickAddToCart={handleAddToCart}
              />
            )}

            <ReviewsSection
              reviews={reviews}
              onReviewSubmitted={() => {
                pushToast({
                  kind: 'info',
                  title: 'Utisak primljen',
                  message: 'Biće prikazan nakon kratke provere administratora.',
                });
              }}
            />
          </>
        )}
      </main>

      <Footer
        settings={settings}
        legalPages={legalPages}
        onNavigateLegal={(slug) => navigateTo(`/${slug}`)}
        onNavigateAdmin={() => navigateTo('/admin')}
      />

      {/* Sticky Mobile Cart Bar when cart has items */}
      {cartSummary.totalPieces > 0 && !isCartOpen && !orderModalProduct && !viberModalPayload && (
        <div className="sm:hidden fixed bottom-3 left-3 right-3 z-30">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="w-full h-12 px-4 rounded-2xl bg-[#121212] text-white shadow-2xl border border-white/15 flex items-center justify-between cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold">
              <ShoppingBag className="w-4 h-4 text-[#C5A059]" aria-hidden="true" />
              <span>Korpa ({cartSummary.totalPieces} kom)</span>
            </span>
            <span className="text-xs font-bold tabular-nums text-[#C5A059]">
              {formatRsd(cartSummary.total)} →
            </span>
          </button>
        </div>
      )}

      <OrderModal
        product={orderModalProduct}
        initialSize={orderModalInitialSize}
        settings={settings}
        isWishlisted={
          orderModalProduct ? wishlistIds.includes(orderModalProduct.id) : false
        }
        onToggleWishlist={handleToggleWishlist}
        onAddToCart={handleAddToCart}
        onViberCopied={(productTitle) => {
          pushToast({
            kind: 'info',
            title: 'Viber poruka kopirana',
            message: `Pripremljena porudžbina za ${productTitle}`,
          });
        }}
        onClose={() => {
          setOrderModalProduct(null);
          setOrderModalInitialSize(undefined);
        }}
        onOrderSuccess={(newOrder, updatedProduct) => {
          setProducts((prev) =>
            prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)),
          );
          setOrderModalProduct(updatedProduct);
          pushToast(
            {
              kind: 'order',
              title: `Porudžbina ${newOrder.id} potvrđena`,
              message: `${newOrder.productTitle} (${newOrder.selectedSize}) · ${formatRsd(newOrder.pricing.total)}`,
            },
            5500,
          );
        }}
      />

      <CartDrawer
        isOpen={isCartOpen}
        cartItems={cartItems}
        products={products}
        settings={settings}
        promotions={promotions}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={() => setCartItems([])}
        onOrderSuccess={(newOrder, updatedProducts) => {
          const updatedMap = new Map(updatedProducts.map((p) => [p.id, p]));
          setProducts((prev) => prev.map((p) => updatedMap.get(p.id) || p));
          pushToast(
            {
              kind: 'order',
              title: `Porudžbina ${newOrder.id} potvrđena`,
              message: `Ukupno za pouzeće: ${formatRsd(newOrder.pricing.total)}`,
            },
            6000,
          );
        }}
        onShareCartCopied={() => {
          pushToast({
            kind: 'info',
            title: 'Link korpe kopiran',
            message: 'Možete ga sačuvati ili poslati na Viber.',
          });
        }}
        onSendCartViber={(payload) => {
          setIsCartOpen(false);
          setViberModalPayload(payload);
        }}
      />

      <WishlistDrawer
        isOpen={isWishlistOpen}
        products={wishlistProducts}
        onClose={() => setIsWishlistOpen(false)}
        onRemoveItem={handleToggleWishlist}
        onOrderItem={(product) => {
          setOrderModalProduct(product);
          setOrderModalInitialSize(undefined);
        }}
      />

      <TrackingInfoModal
        isOpen={isTrackingModalOpen}
        settings={settings}
        onClose={() => setIsTrackingModalOpen(false)}
      />

      <ConsentBanner
        settings={settings}
        onOpenPrivacy={() => navigateTo('/politika-privatnosti')}
        onConsentSaved={() => setIsConsentPending(false)}
      />

      <FloatingViberWidget
        settings={settings}
        hidden={Boolean(
          isAdminRoute ||
            orderModalProduct ||
            isCartOpen ||
            isWishlistOpen ||
            isTrackingModalOpen ||
            viberModalPayload,
        )}
        hasBottomOverlay={Boolean(isConsentPending || cartSummary.totalPieces > 0)}
        onPhoneCopied={() => {
          pushToast({
            kind: 'info',
            title: 'Viber broj kopiran',
            message: `${settings.contactPhoneDisplay} · Otvorite Viber ili nas pozovite.`,
          });
        }}
      />

      <ViberFallbackModal
        payload={viberModalPayload}
        settings={settings}
        onClose={() => setViberModalPayload(null)}
        onCopied={(what) => {
          pushToast({
            kind: 'info',
            title: what === 'phone' ? 'Broj telefona kopiran' : 'Viber poruka kopirana',
            message:
              what === 'phone'
                ? settings.contactPhoneDisplay
                : 'Nalepite poruku u Viber razgovor — porudžbina se potvrđuje u chatu.',
          });
        }}
      />

      <OfflineIndicator />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
