import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Gift,
  MessageCircle,
  Minus,
  PackageCheck,
  PhoneCall,
  Plus,
  Share2,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  CartItem,
  CouponCode,
  Order,
  OrderCustomerInput,
  Product,
  PromotionRule,
  StoreSettings,
} from '../types/store';
import { submitOrderApi, validateCouponApi } from '../utils/api';
import {
  computeCartTotals,
  CUSTOMER_PREFILL_STORAGE_KEY,
  getVariantAvailableStock,
  serializeCartShareParam,
} from '../utils/cartAndPromoLogic';
import { formatRsd, validateCustomerForm } from '../utils/storeLogic';
import { buildCartViberMessage, buildTelHref } from '../utils/viberLogic';

interface CartDrawerProps {
  isOpen: boolean;
  cartItems: CartItem[];
  products: Product[];
  settings: StoreSettings;
  promotions: PromotionRule[];
  onClose: () => void;
  onUpdateQty: (productId: string, size: string, nextQty: number) => void;
  onRemoveItem: (productId: string, size: string) => void;
  onClearCart: () => void;
  onOrderSuccess: (order: Order, updatedProducts: Product[]) => void;
  onShareCartCopied: () => void;
  onSendCartViber?: (payload: { title: string; subtitle: string; message: string }) => void;
}

export function CartDrawer({
  isOpen,
  cartItems,
  products,
  settings,
  promotions,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderSuccess,
  onShareCartCopied,
  onSendCartViber,
}: CartDrawerProps) {
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [validatedCoupon, setValidatedCoupon] = useState<CouponCode | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [giftWrap, setGiftWrap] = useState(false);
  const [pickupInPerson, setPickupInPerson] = useState(false);

  const [fullName, setFullName] = useState('');
  const [street, setStreet] = useState('');
  const [cityZip, setCityZip] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [rememberDetails, setRememberDetails] = useState(false);

  const [errors, setErrors] = useState<
    Partial<Record<keyof OrderCustomerInput | 'submit', string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(CUSTOMER_PREFILL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OrderCustomerInput>;
        if (!fullName && parsed.fullName) setFullName(parsed.fullName);
        if (!street && parsed.street) setStreet(parsed.street);
        if (!cityZip && parsed.cityZip) setCityZip(parsed.cityZip);
        if (!phone && parsed.phone) setPhone(parsed.phone);
        setRememberDetails(true);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const summary = useMemo(
    () =>
      computeCartTotals({
        cartItems,
        products,
        settings,
        promotions,
        coupon: validatedCoupon,
        couponInputCode: validatedCoupon ? validatedCoupon.code : '',
        pickupInPerson,
        giftWrap,
      }),
    [cartItems, products, settings, promotions, validatedCoupon, pickupInPerson, giftWrap],
  );

  if (!isOpen) return null;

  const progressPercent = Math.min(
    100,
    Math.round(
      (summary.subtotalAfterDiscounts / Math.max(1, settings.freeShippingThresholdRsd)) * 100,
    ),
  );

  const handleApplyCoupon = async () => {
    setCouponMsg(null);
    if (!couponCodeInput.trim()) {
      setValidatedCoupon(null);
      return;
    }
    try {
      const coupon = await validateCouponApi(couponCodeInput.trim());
      setValidatedCoupon(coupon);
      setCouponMsg(`Kupon ${coupon.code} je aktivan!`);
    } catch (err) {
      setValidatedCoupon(null);
      setCouponMsg(err instanceof Error ? err.message : 'Nevažeći kupon.');
    }
  };

  const handleShareCart = async () => {
    const param = serializeCartShareParam(cartItems);
    const url = `${window.location.origin}/?korpa=${param}`;
    try {
      await navigator.clipboard.writeText(url);
      onShareCartCopied();
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSendCartToViber = () => {
    const message = buildCartViberMessage({
      brandName: settings.brandName,
      cartItems,
      products,
      summary,
      settings,
      pickupInPerson,
      giftWrap,
    });
    onSendCartViber?.({
      title: 'Slanje cele korpe preko Vibera',
      subtitle: `${summary.totalPieces} kom · ${formatRsd(summary.total)}`,
      message,
    });
  };

  const handleClearSavedCustomer = () => {
    try {
      localStorage.removeItem(CUSTOMER_PREFILL_STORAGE_KEY);
    } catch {
      // ignore
    }
    setRememberDetails(false);
    setFullName('');
    setStreet('');
    setCityZip('');
    setPhone('');
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || cartItems.length === 0) return;

    const customer: OrderCustomerInput = {
      fullName,
      street,
      cityZip,
      phone,
      note,
    };
    const formErrors = validateCustomerForm(customer, { pickupInPerson });
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const result = await submitOrderApi({
        items: cartItems.map((c) => ({
          productId: c.productId,
          size: c.size,
          color: c.color,
          quantity: c.quantity,
        })),
        customer,
        couponCode: validatedCoupon?.code,
        giftWrap,
        pickupInPerson,
        idempotencyKey,
      });

      if (rememberDetails) {
        try {
          localStorage.setItem(
            CUSTOMER_PREFILL_STORAGE_KEY,
            JSON.stringify({ fullName, street, cityZip, phone }),
          );
        } catch {
          // ignore
        }
      }

      setConfirmedOrder(result.order);
      onOrderSuccess(result.order, result.updatedProducts || []);
      onClearCart();
      setValidatedCoupon(null);
      setCouponCodeInput('');
      setIdempotencyKey(
        `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      );
    } catch (err) {
      setErrors({
        submit:
          err instanceof Error ? err.message : 'Greška pri slanju porudžbine.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vaša korpa i plaćanje pouzećem"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <aside className="relative w-full max-w-lg bg-[#FAF9F6] h-full shadow-2xl border-l border-[#E6E2D8] flex flex-col overflow-hidden">
        <div className="px-5 py-4 bg-white border-b border-[#E6E2D8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
            <h2 className="font-editorial text-lg font-semibold text-[#121212]">
              {confirmedOrder ? 'Porudžbina potvrđena' : `Korpa (${summary.totalPieces})`}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {!confirmedOrder && cartItems.length > 0 && (
              <button
                type="button"
                onClick={handleShareCart}
                aria-label="Kopiraj link korpe za deljenje"
                className="h-9 px-3 rounded-full border border-[#E2DDD3] bg-[#FAF9F6] hover:border-[#121212] text-xs font-medium text-[#121212] inline-flex items-center gap-1 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Podeli korpu</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setConfirmedOrder(null);
                onClose();
              }}
              aria-label="Zatvori korpu"
              className="w-9 h-9 rounded-full border border-[#E2DDD3] hover:border-[#121212] flex items-center justify-center text-[#121212] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {confirmedOrder ? (
            <div className="bg-white border border-[#E6E2D8] rounded-2xl p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-700">
                <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9F1239]">
                {settings.brandName} · {settings.brandSubtitle}
              </p>
              <h3 className="font-editorial text-2xl font-semibold text-[#121212]">
                Hvala na porudžbini!
              </h3>
              <p className="text-xs sm:text-sm text-[#6B6862]">
                Šifra porudžbine:{' '}
                <strong className="text-[#121212] tabular-nums">{confirmedOrder.id}</strong>
                <br />
                Sačuvajte šifru za praćenje pošiljke. Plaćanje kuriru pri preuzimanju:{' '}
                <strong className="text-[#9F1239] tabular-nums">
                  {formatRsd(confirmedOrder.pricing.total)}
                </strong>
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  onClose();
                }}
                className="w-full h-11 rounded-full bg-[#121212] text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                Nastavi kupovinu
              </button>
            </div>
          ) : cartItems.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-[#6B6862]/40 mx-auto" aria-hidden="true" />
              <p className="font-editorial text-lg text-[#121212]">Vaša korpa je prazna</p>
              <p className="text-xs text-[#6B6862] max-w-xs mx-auto">
                Dodajte 2 artikla za -15% paket popust ili 3+ artikla za -20% popusta i
                besplatnu Post Express dostavu!
              </p>
            </div>
          ) : (
            <>
              {/* Free Shipping Progress Bar */}
              <div className="bg-white border border-[#E6E2D8] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#121212]">
                    <Truck className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
                    {summary.isFreeShipping
                      ? 'Ostvarili ste BESPLATNU dostavu!'
                      : `Dodajte još ${formatRsd(summary.freeShippingRemainingRsd)} (ili ukupno 3 kom) za besplatnu dostavu`}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#EFECE5] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      summary.isFreeShipping ? 'bg-emerald-600' : 'bg-[#9F1239]'
                    }`}
                    style={{ width: `${summary.isFreeShipping ? 100 : progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Cart Items */}
              <div className="space-y-2.5">
                {cartItems.map((item) => {
                  const prod = productMap.get(item.productId);
                  if (!prod) return null;
                  const maxAvail = getVariantAvailableStock(prod, item.size, item.color);
                  return (
                    <div
                      key={`${item.productId}::${item.size}`}
                      className="flex gap-3 p-3 rounded-xl bg-white border border-[#E6E2D8]"
                    >
                      <img
                        src={prod.imageUrl}
                        alt={prod.title}
                        className="w-16 h-20 rounded-lg object-cover bg-[#F3F2EE] shrink-0"
                      />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#121212] line-clamp-2">
                              {prod.title}
                            </p>
                            <p className="text-[11px] text-[#6B6862] mt-0.5">
                              Veličina: <strong className="text-[#121212]">{item.size}</strong>
                              {maxAvail <= 2 && maxAvail > 0 && (
                                <span className="text-[#9F1239] ml-1.5">
                                  (stanje: {maxAvail})
                                </span>
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.productId, item.size)}
                            aria-label={`Ukloni ${prod.title} iz korpe`}
                            className="text-[#6B6862] hover:text-[#9F1239] p-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <div className="inline-flex items-center gap-1.5 border border-[#E2DDD3] rounded-lg px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateQty(item.productId, item.size, item.quantity - 1)
                              }
                              aria-label={`Smanji količinu za ${prod.title}`}
                              className="w-6 h-6 flex items-center justify-center text-[#121212] cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-bold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={item.quantity >= maxAvail}
                              onClick={() =>
                                onUpdateQty(item.productId, item.size, item.quantity + 1)
                              }
                              aria-label={`Povećaj količinu za ${prod.title}`}
                              className="w-6 h-6 flex items-center justify-center text-[#121212] disabled:opacity-30 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <span className="text-xs font-bold text-[#121212] tabular-nums">
                            {formatRsd(prod.salePrice * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Coupon & Extras */}
              <div className="bg-white border border-[#E6E2D8] rounded-xl p-3.5 space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag
                      className="w-3.5 h-3.5 text-[#6B6862] absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value)}
                      placeholder="Promo kod / kupon (opciono)"
                      aria-label="Promo kod"
                      className="w-full h-9 pl-8 pr-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-xs text-[#121212] uppercase"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleApplyCoupon()}
                    className="h-9 px-3.5 rounded-lg bg-[#121212] text-white text-xs font-semibold cursor-pointer"
                  >
                    Primeni
                  </button>
                </div>
                {couponMsg && (
                  <p
                    className={`text-[11px] font-medium ${
                      validatedCoupon ? 'text-emerald-700' : 'text-[#9F1239]'
                    }`}
                  >
                    {couponMsg}
                  </p>
                )}

                <div className="flex flex-col gap-2 pt-1 border-t border-[#F0ECE3] text-xs">
                  <label className="inline-flex items-center justify-between gap-2 cursor-pointer">
                    <span className="inline-flex items-center gap-2 text-[#121212]">
                      <Gift className="w-3.5 h-3.5 text-[#C5A059]" aria-hidden="true" />
                      Ukrasno poklon pakovanje (+{formatRsd(settings.giftWrapCostRsd)})
                    </span>
                    <input
                      type="checkbox"
                      checked={giftWrap}
                      onChange={(e) => setGiftWrap(e.target.checked)}
                      className="w-4 h-4 accent-[#9F1239]"
                    />
                  </label>

                  {settings.enablePickupInPerson && (
                    <label className="inline-flex items-center justify-between gap-2 cursor-pointer">
                      <span className="inline-flex items-center gap-2 text-[#121212]">
                        <Store className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
                        Lično preuzimanje (0 RSD poštarina)
                      </span>
                      <input
                        type="checkbox"
                        checked={pickupInPerson}
                        onChange={(e) => setPickupInPerson(e.target.checked)}
                        className="w-4 h-4 accent-[#9F1239]"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* COD Delivery Form */}
              <form onSubmit={handleCheckout} noValidate className="bg-white border border-[#E6E2D8] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#121212]">
                    Podaci za plaćanje pouzećem
                  </span>
                  {rememberDetails && (
                    <button
                      type="button"
                      onClick={handleClearSavedCustomer}
                      className="text-[11px] text-[#9F1239] hover:underline cursor-pointer"
                    >
                      Obriši sačuvane podatke
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="cart-fullName" className="block text-[11px] font-medium mb-1">
                      Ime i prezime *
                    </label>
                    <input
                      id="cart-fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jelena Marković"
                      className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-sm"
                    />
                    {errors.fullName && (
                      <p className="text-[11px] text-[#9F1239] mt-0.5">{errors.fullName}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cart-phone" className="block text-[11px] font-medium mb-1">
                      Mobilni telefon *
                    </label>
                    <input
                      id="cart-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="064 123 4567"
                      className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-sm"
                    />
                    {errors.phone && (
                      <p className="text-[11px] text-[#9F1239] mt-0.5">{errors.phone}</p>
                    )}
                  </div>
                </div>

                {!pickupInPerson && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="cart-street" className="block text-[11px] font-medium mb-1">
                        Ulica i broj *
                      </label>
                      <input
                        id="cart-street"
                        type="text"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Knez Mihailova 14"
                        className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-sm"
                      />
                      {errors.street && (
                        <p className="text-[11px] text-[#9F1239] mt-0.5">{errors.street}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="cart-city" className="block text-[11px] font-medium mb-1">
                        Grad i poštanski broj *
                      </label>
                      <input
                        id="cart-city"
                        type="text"
                        value={cityZip}
                        onChange={(e) => setCityZip(e.target.value)}
                        placeholder="Beograd 11000"
                        className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-sm"
                      />
                      {errors.cityZip && (
                        <p className="text-[11px] text-[#9F1239] mt-0.5">{errors.cityZip}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="cart-note" className="block text-[11px] font-medium mb-1">
                    Napomena za kurira (opciono)
                  </label>
                  <input
                    id="cart-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Pozvati pre isporuke..."
                    className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg text-sm"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-[11px] text-[#6B6862] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberDetails}
                    onChange={(e) => setRememberDetails(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#9F1239]"
                  />
                  <span>Sačuvaj moje podatke na ovom uređaju za bržu kupovinu</span>
                </label>

                {/* Price Breakdown */}
                <div className="pt-3 border-t border-[#F0ECE3] space-y-1.5 text-xs tabular-nums">
                  <div className="flex justify-between text-[#6B6862]">
                    <span>Vrednost artikala ({summary.totalPieces} kom):</span>
                    <span className="text-[#121212]">{formatRsd(summary.baseTotal)}</span>
                  </div>
                  {summary.bundleDiscountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Paket popust (-{summary.bundleDiscountPercent}%):</span>
                      <span>-{formatRsd(summary.bundleDiscountAmount)}</span>
                    </div>
                  )}
                  {summary.promoDiscountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Akcija ({summary.appliedPromoName}):</span>
                      <span>-{formatRsd(summary.promoDiscountAmount)}</span>
                    </div>
                  )}
                  {summary.couponDiscountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Kupon ({summary.appliedCouponCode}):</span>
                      <span>-{formatRsd(summary.couponDiscountAmount)}</span>
                    </div>
                  )}
                  {summary.giftWrapCost > 0 && (
                    <div className="flex justify-between text-[#6B6862]">
                      <span>Poklon pakovanje:</span>
                      <span>{formatRsd(summary.giftWrapCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#6B6862]">
                    <span>Dostava:</span>
                    <span className={summary.isFreeShipping ? 'text-emerald-700 font-semibold' : ''}>
                      {summary.isFreeShipping ? '0 RSD (Besplatna)' : formatRsd(summary.shippingCost)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#F0ECE3] text-sm font-bold">
                    <span>UKUPNO POUZEĆEM:</span>
                    <span className="text-[#9F1239]">{formatRsd(summary.total)}</span>
                  </div>
                </div>

                {errors.submit && (
                  <p role="alert" className="text-xs font-medium text-[#9F1239] bg-rose-50 p-2.5 rounded-lg">
                    {errors.submit}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-xl bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <PackageCheck className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isSubmitting ? 'Obrada porudžbine...' : 'POTVRDI PORUDŽBINU IZ KORPE'}
                  </span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {onSendCartViber && (
                    <button
                      type="button"
                      onClick={handleSendCartToViber}
                      className="h-11 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                      <span>Pošalji korpu na Viber</span>
                    </button>
                  )}
                  <a
                    href={buildTelHref(settings.contactPhoneDisplay || settings.contactViberNumber)}
                    className={`h-11 rounded-xl border border-[#D8D2C5] bg-[#FAF9F6] hover:border-[#9F1239] text-[#121212] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      onSendCartViber ? '' : 'sm:col-span-2'
                    }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
                    <span>Pozovi nas ({settings.contactPhoneDisplay})</span>
                  </a>
                </div>
              </form>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
