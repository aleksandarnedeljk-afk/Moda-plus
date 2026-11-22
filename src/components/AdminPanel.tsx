import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Camera,
  Flame,
  LayoutDashboard,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  X,
} from 'lucide-react';
import type { AdminUserPublic } from '../types/store';
import {
  fetchAdminBootstrapApi,
  getAuthStatusApi,
  getCurrentAdminUserApi,
  logoutAdminApi,
  type AdminBootstrapData,
} from '../utils/api';
import { formatRsd } from '../utils/storeLogic';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallUI';
import { AdminAuthScreen } from './admin/AdminAuthScreen';
import { ClearanceAndMarketingTab } from './admin/ClearanceAndMarketingTab';
import { CustomersAndShippingTab } from './admin/CustomersAndShippingTab';
import { FinancesAndStatsTab } from './admin/FinancesAndStatsTab';
import { InventoryTab } from './admin/InventoryTab';
import { OrdersAndManualTab } from './admin/OrdersAndManualTab';
import { ProductEntryAndCatalogTab } from './admin/ProductEntryAndCatalogTab';
import { SettingsAndSystemTab } from './admin/SettingsAndSystemTab';

interface AdminPanelProps {
  onStorefrontRefresh: () => void;
  onBackToStore: () => void;
}

type AdminTab =
  | 'overview'
  | 'add'
  | 'catalog'
  | 'inventory'
  | 'orders'
  | 'shipping'
  | 'customers'
  | 'clearance'
  | 'marketing'
  | 'finances'
  | 'settings';

const TAB_LIST: { id: AdminTab; label: string; icon: typeof LayoutDashboard; ownerOnly?: boolean }[] = [
  { id: 'overview', label: 'Kontrolni centar', icon: LayoutDashboard },
  { id: 'add', label: '+ Dodaj artikal', icon: Camera },
  { id: 'orders', label: 'Porudžbine', icon: ShoppingBag },
  { id: 'inventory', label: 'Zalihe', icon: Layers },
  { id: 'catalog', label: 'Katalog', icon: Package },
  { id: 'shipping', label: 'Dostava & COD', icon: Truck },
  { id: 'customers', label: 'Kupci', icon: Users },
  { id: 'clearance', label: 'Rasprodaja', icon: Flame },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'finances', label: 'Finansije', icon: BarChart3, ownerOnly: true },
  { id: 'settings', label: 'Podešavanja', icon: Settings },
];

export function AdminPanel({ onStorefrontRefresh, onBackToStore }: AdminPanelProps) {
  const [authStatus, setAuthStatus] = useState<{
    loaded: boolean;
    needsInitialSetup: boolean;
    envPasscodeActive: boolean;
    ownerDisplayName: string;
  }>({
    loaded: false,
    needsInitialSetup: false,
    envPasscodeActive: false,
    ownerDisplayName: 'MODA PLUS OUTLET',
  });

  const [currentUser, setCurrentUser] = useState<AdminUserPublic | null>(null);
  const [bootstrap, setBootstrap] = useState<AdminBootstrapData | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Check initial auth status and any active in-memory session
  useEffect(() => {
    void (async () => {
      try {
        const [st, user] = await Promise.all([
          getAuthStatusApi(),
          getCurrentAdminUserApi(),
        ]);
        setAuthStatus({ loaded: true, ...st });
        setCurrentUser(user);
      } catch {
        setAuthStatus((prev) => ({ ...prev, loaded: true }));
      }
    })();
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!currentUser) return;
    setLoadingBootstrap(true);
    setBootstrapError(null);
    try {
      const data = await fetchAdminBootstrapApi(
        fromDate || undefined,
        toDate || undefined,
      );
      setBootstrap(data);
    } catch (err) {
      setBootstrapError(
        err instanceof Error ? err.message : 'Greška pri učitavanju admin podataka.',
      );
      if (err instanceof Error && err.message.toLowerCase().includes('istekla')) {
        setCurrentUser(null);
      }
    } finally {
      setLoadingBootstrap(false);
    }
  }, [currentUser, fromDate, toDate]);

  useEffect(() => {
    if (currentUser) {
      void loadAdminData();
    }
  }, [currentUser, loadAdminData]);

  // Client-side inactivity auto-lock matching server session timeout
  useEffect(() => {
    if (!currentUser || !bootstrap) return;
    const timeoutMs = (bootstrap.settings.autoLockMinutes || 30) * 60_000;
    let timer = window.setTimeout(() => {
      void logoutAdminApi();
      setCurrentUser(null);
    }, timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void logoutAdminApi();
        setCurrentUser(null);
      }, timeoutMs);
    };

    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [currentUser, bootstrap]);

  const handleLock = () => {
    void logoutAdminApi();
    setCurrentUser(null);
    setBootstrap(null);
  };

  const handleDataChanged = () => {
    void loadAdminData();
    onStorefrontRefresh();
  };

  if (!authStatus.loaded) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6 text-xs text-[#6B6862]">
        Provera bezbednosnog statusa...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AdminAuthScreen
        brandName={authStatus.ownerDisplayName}
        needsInitialSetup={authStatus.needsInitialSetup}
        envPasscodeActive={authStatus.envPasscodeActive}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setAuthStatus((prev) => ({ ...prev, needsInitialSetup: false }));
        }}
        onBackToStore={onBackToStore}
      />
    );
  }

  const visibleTabs = TAB_LIST.filter(
    (t) => !t.ownerOnly || currentUser.role === 'vlasnik',
  );

  const activeItemsCount =
    bootstrap?.products.filter((p) => p.active && Object.values(p.stockBySize).some((q) => (q ?? 0) > 0)).length ?? 0;
  const totalPiecesCount = bootstrap
    ? bootstrap.products.reduce<number>(
        (s, p) =>
          s +
          (p.variants
            ? p.variants.reduce<number>(
                (vs, v) => vs + Math.max(0, v.physicalStock - v.reservedStock),
                0,
              )
            : Object.values(p.stockBySize).reduce<number>(
                (ss, n) => ss + (n ?? 0),
                0,
              )),
        0,
      )
    : 0;
  const todayYmd = new Date().toISOString().slice(0, 10);
  const newOrdersToday =
    bootstrap?.orders.filter(
      (o) =>
        o.createdAt.slice(0, 10) === todayYmd &&
        o.status !== 'Otkazano' &&
        o.status !== 'Vraćena',
    ).length ?? 0;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#121212] pb-24 lg:pb-12">
      {/* Top Dark Bar */}
      <header className="sticky top-0 z-30 bg-[#121212] text-white border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToStore}
              className="inline-flex items-center gap-1 h-9 px-2.5 sm:px-3 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Prodavnica</span>
              <span className="sm:hidden">Sajt</span>
            </button>
            <div className="min-w-0 flex items-center gap-3">
              <BrandLogo
                brandName={bootstrap?.settings.brandName || authStatus.ownerDisplayName || 'MODA PLUS OUTLET'}
                brandSubtitle="Administracija"
                logoMonogram={bootstrap?.settings.logoMonogram || 'MP'}
                variant="dark"
                size="sm"
                showSubtitle={false}
              />
              <span className="hidden md:inline-block text-[11px] text-white/60 truncate border-l border-white/15 pl-3">
                Admin · {currentUser.displayName} ({currentUser.role})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={handleLock}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-full border border-white/20 hover:bg-white/10 text-xs font-medium cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Zaključaj</span>
            </button>
          </div>
        </div>

        {/* Desktop Horizontal Navigation Tabs */}
        <nav
          aria-label="Admin navigacija"
          className="hidden lg:block bg-[#191919] border-t border-white/10"
        >
          <div className="max-w-7xl mx-auto px-6 flex items-center gap-1 overflow-x-auto no-scrollbar py-1.5">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#9F1239] text-white'
                      : 'text-white/75 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-5 space-y-5">
        {bootstrapError && (
          <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-[#9F1239]">
            {bootstrapError}
          </div>
        )}

        {loadingBootstrap && !bootstrap ? (
          <div className="p-8 text-center text-xs text-[#6B6862]">
            Učitavanje operativnih podataka...
          </div>
        ) : (
          bootstrap && (
            <>
              {/* OVERVIEW / KONTROLNI CENTAR */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Primary Mobile-First Hero Action */}
                  <div className="bg-[#121212] text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#C5A059] font-semibold">
                        BRZA AKCIJA SA TELEFONA
                      </p>
                      <h1 className="font-editorial text-xl sm:text-2xl font-semibold mt-1">
                        Kontrolni centar prodavnice
                      </h1>
                      <p className="text-xs text-white/70 mt-1">
                        Slikajte nove komade, obradite porudžbine za slanje i pratite otkupnine.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('add')}
                      className="h-12 px-5 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Fotografiši i dodaj artikal</span>
                    </button>
                  </div>

                  {/* Top KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
                      <p className="text-[11px] text-[#6B6862]">Aktivni artikli</p>
                      <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">
                        {activeItemsCount}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
                      <p className="text-[11px] text-[#6B6862]">Dostupno komada</p>
                      <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">
                        {totalPiecesCount}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
                      <p className="text-[11px] text-[#6B6862]">Nove porudžbine danas</p>
                      <p className="text-xl sm:text-2xl font-bold text-[#9F1239] mt-1 tabular-nums">
                        {newOrdersToday}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E6E2D8] rounded-xl p-4">
                      <p className="text-[11px] text-[#6B6862]">Realizovana prodaja</p>
                      <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">
                        {formatRsd(bootstrap.financials.netRealizedSalesRsd)}
                      </p>
                    </div>
                  </div>

                  {/* Actionable Alerts */}
                  {bootstrap.alerts.length > 0 && (
                    <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-2.5">
                      <h2 className="font-editorial text-base font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#9F1239]" />
                        <span>Aktivna upozorenja ({bootstrap.alerts.length})</span>
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {bootstrap.alerts.map((al) => (
                          <button
                            key={al.id}
                            type="button"
                            onClick={() => {
                              if (al.targetTab) {
                                setActiveTab(al.targetTab as AdminTab);
                              }
                            }}
                            className={`text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                              al.severity === 'high'
                                ? 'bg-rose-50 border-rose-200 text-[#9F1239]'
                                : al.severity === 'medium'
                                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                                  : 'bg-[#FAF9F6] border-[#E6E2D8] text-[#121212]'
                            }`}
                          >
                            <p className="font-semibold">{al.title}</p>
                            <p className="opacity-85 mt-0.5">{al.description}</p>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Quick Navigation Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {visibleTabs
                      .filter((t) => t.id !== 'overview')
                      .map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className="p-4 rounded-2xl bg-white border border-[#E6E2D8] hover:border-[#121212] text-left space-y-2 cursor-pointer transition-colors"
                          >
                            <Icon className="w-5 h-5 text-[#9F1239]" />
                            <p className="text-xs font-semibold text-[#121212]">{tab.label}</p>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {(activeTab === 'add' || activeTab === 'catalog') && (
                <ProductEntryAndCatalogTab
                  mode={activeTab}
                  userRole={currentUser.role}
                  products={bootstrap.products}
                  categories={bootstrap.categories}
                  onProductsChanged={handleDataChanged}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryTab
                  products={bootstrap.products}
                  stockMovements={bootstrap.stockMovements}
                  onInventoryUpdated={handleDataChanged}
                />
              )}

              {activeTab === 'orders' && (
                <OrdersAndManualTab
                  orders={bootstrap.orders}
                  products={bootstrap.products}
                  settings={bootstrap.settings}
                  onDataChanged={handleDataChanged}
                />
              )}

              {(activeTab === 'customers' || activeTab === 'shipping') && (
                <CustomersAndShippingTab
                  mode={activeTab}
                  customers={bootstrap.customers}
                  orders={bootstrap.orders}
                  onDataChanged={handleDataChanged}
                />
              )}

              {(activeTab === 'clearance' || activeTab === 'marketing') && (
                <ClearanceAndMarketingTab
                  mode={activeTab}
                  products={bootstrap.products}
                  priceHistory={bootstrap.priceHistory}
                  promotions={bootstrap.promotions}
                  coupons={bootstrap.coupons}
                  settings={bootstrap.settings}
                  onDataChanged={handleDataChanged}
                />
              )}

              {activeTab === 'finances' && (
                <FinancesAndStatsTab
                  userRole={currentUser.role}
                  financials={bootstrap.financials}
                  stats={bootstrap.stats}
                  expenses={bootstrap.expenses}
                  fromDate={fromDate}
                  toDate={toDate}
                  onDateFilterChange={(f, t) => {
                    setFromDate(f);
                    setToDate(t);
                  }}
                  onDataChanged={handleDataChanged}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsAndSystemTab
                  userRole={currentUser.role}
                  settings={bootstrap.settings}
                  categories={bootstrap.categories}
                  legalPages={bootstrap.legalPages}
                  reviews={bootstrap.reviews}
                  restockSubscriptions={bootstrap.restockSubscriptions}
                  users={bootstrap.users}
                  backups={bootstrap.backups}
                  onDataChanged={handleDataChanged}
                />
              )}
            </>
          )
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobilna admin navigacija"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#121212] text-white border-t border-white/10 grid grid-cols-5 h-16"
      >
        {[
          { id: 'overview' as AdminTab, label: 'Centar', icon: LayoutDashboard },
          { id: 'add' as AdminTab, label: 'Dodaj', icon: Plus },
          { id: 'orders' as AdminTab, label: 'Porudžbine', icon: ShoppingBag },
          { id: 'inventory' as AdminTab, label: 'Zalihe', icon: Layers },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMoreOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
                active ? 'text-[#C5A059]' : 'text-white/75'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMoreOpen((o) => !o)}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
            mobileMoreOpen ? 'text-[#C5A059]' : 'text-white/75'
          }`}
        >
          <Menu className="w-4 h-4" />
          <span>Više</span>
        </button>
      </nav>

      {/* Mobile "Više" Drawer */}
      {mobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end bg-black/55">
          <div
            className="absolute inset-0"
            onClick={() => setMobileMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full bg-[#FAF9F6] rounded-t-2xl p-4 pb-8 space-y-3 border-t border-[#E6E2D8]">
            <div className="flex items-center justify-between">
              <p className="font-editorial text-base font-semibold">Sve admin sekcije</p>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="w-8 h-8 rounded-full border border-[#D8D2C5] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {visibleTabs
                .filter((t) => !['overview', 'add', 'orders', 'inventory'].includes(t.id))
                .map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMoreOpen(false);
                      }}
                      className="h-11 px-3 rounded-xl bg-white border border-[#E6E2D8] flex items-center gap-2 text-xs font-semibold text-left"
                    >
                      <Icon className="w-4 h-4 text-[#9F1239]" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
