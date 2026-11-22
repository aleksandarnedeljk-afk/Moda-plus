import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Heart,
  Info,
  MessageCircle,
  PackageCheck,
  PhoneCall,
  Ruler,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import {
  ADULT_SIZE_GUIDE_ROWS,
  BABY_SIZE_GUIDE_ROWS,
  DEFAULT_STORE_SETTINGS,
} from '../config/storeConfig';
import type {
  BundleQuantity,
  Order,
  OrderCustomerInput,
  Product,
  ProductSize,
  StoreSettings,
} from '../types/store';
import { submitOrderApi } from '../utils/api';
import { CUSTOMER_PREFILL_STORAGE_KEY } from '../utils/cartAndPromoLogic';
import {
  calculateOrderTotals,
  formatRsd,
  getDiscountPercent,
  getFirstAvailableSize,
  getSizeEntries,
  validateCustomerForm,
} from '../utils/storeLogic';
import {
  buildDetailedProductViberMessage,
  buildTelHref,
  buildViberDirectChatUrl,
  buildViberForwardTextUrl,
  normalizeToInternationalPhone,
} from '../utils/viberLogic';

interface OrderModalProps {
  product: Product | null;
  initialSize?: ProductSize;
  settings?: StoreSettings;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product, size: ProductSize) => void;
  onViberCopied?: (productTitle: string) => void;
  onClose: () => void;
  onOrderSuccess: (order: Order, updatedProduct: Product) => void;
}

export function OrderModal({
  product,
  initialSize,
  settings = DEFAULT_STORE_SETTINGS,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onViberCopied,
  onClose,
  onOrderSuccess,
}: OrderModalProps) {
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [bundleQuantity, setBundleQuantity] = useState<BundleQuantity>(1);
  const [showSizeGuide, setShowSizeGuide] = useState(false);

  const [fullName, setFullName] = useState('');
  const [street, setStreet] = useState('');
  const [cityZip, setCityZip] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [rememberDetails, setRememberDetails] = useState(false);

  const [errors, setErrors] = useState<
    Partial<Record<keyof OrderCustomerInput | 'size' | 'submit', string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [viberToast, setViberToast] = useState<string | null>(null);
  const [showViberPanel, setShowViberPanel] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const BUNDLE_OPTIONS: {
    qty: BundleQuantity;
    title: string;
    subtitle: string;
    badge?: string;
  }[] = [
    { qty: 1, title: '1 komad', subtitle: 'Akcijska cena' },
    {
      qty: 2,
      title: '2 komada',
      subtitle: `-${settings.bundle2DiscountPercent}% popusta`,
      badge: `-${settings.bundle2DiscountPercent}%`,
    },
    {
      qty: 3,
      title: '3 komada',
      subtitle: `-${settings.bundle3DiscountPercent}% + BESPLATNA DOSTAVA`,
      badge: 'NAJPOVOLJNIJE',
    },
  ];

  useEffect(() => {
    if (!product) return;
    const sizeValid =
      initialSize && (product.stockBySize[initialSize] ?? 0) > 0
        ? initialSize
        : getFirstAvailableSize(product);
    setSelectedSize(sizeValid);
    setBundleQuantity(1);
    setShowSizeGuide(false);
    setErrors({});
    setConfirmedOrder(null);
    setViberToast(null);
    setShowViberPanel(false);
    setImageFailed(false);
    setIdempotencyKey(
      `quick-${product.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    );

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
  }, [product?.id, initialSize]);

  useEffect(() => {
    if (!product) return;
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
  }, [product, onClose]);

  const pricing = useMemo(() => {
    if (!product) return calculateOrderTotals(0, 1, settings);
    return calculateOrderTotals(product.salePrice, bundleQuantity, settings);
  }, [product, bundleQuantity, settings]);

  if (!product) return null;

  const sizeEntries = getSizeEntries(product);
  const discount = getDiscountPercent(product.originalPrice, product.salePrice);
  const selectedSizeStock = selectedSize ? (product.stockBySize[selectedSize] ?? 0) : 0;

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedSize) {
      setErrors({ size: 'Molimo izaberite veličinu pre potvrde porudžbine.' });
      return;
    }
    if (selectedSizeStock < bundleQuantity) {
      setErrors({
        submit: `U veličini ${selectedSize} dostupno je ${selectedSizeStock} komada. Smanjite količinu ili kombinujte artikle kroz Korpu.`,
      });
      return;
    }

    const customer: OrderCustomerInput = {
      fullName,
      street,
      cityZip,
      phone,
      note,
    };

    const formErrors = validateCustomerForm(customer);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const result = await submitOrderApi({
        productId: product.id,
        selectedSize,
        bundleQuantity,
        customer,
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
      if (result.updatedProduct) {
        onOrderSuccess(result.order, result.updatedProduct);
      }
      setIdempotencyKey(
        `quick-${product.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      );
    } catch (err) {
      setErrors({
        submit:
          err instanceof Error
            ? err.message
            : 'Nismo uspeli da sačuvamo porudžbinu. Pokušajte ponovo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeViberSize = selectedSize ?? getFirstAvailableSize(product) ?? 'Univerzalna';
  const preparedViberMessage = buildDetailedProductViberMessage({
    brandName: settings.brandName,
    product,
    size: activeViberSize,
    quantity: bundleQuantity,
    unitOrTotalPriceRsd: pricing.subtotal,
  });
  const intlViberPhone = normalizeToInternationalPhone(
    settings.contactViberNumber || settings.contactPhoneDisplay,
  );
  const viberChatHref = buildViberDirectChatUrl(intlViberPhone);
  const viberForwardHref = buildViberForwardTextUrl(preparedViberMessage);
  const telHref = buildTelHref(settings.contactPhoneDisplay || intlViberPhone);

  const handleCopyViberMessage = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(preparedViberMessage);
        setViberToast('Pripremljena Viber poruka je kopirana! Možete je nalepiti u Viber razgovor.');
        onViberCopied?.(product.title);
      } else {
        setViberToast('Kopirajte tekst poruke iz polja ispod i pošaljite na naš Viber.');
      }
    } catch {
      setViberToast('Kopirajte tekst poruke iz polja ispod i pošaljite na naš Viber.');
    }

    window.setTimeout(() => {
      setViberToast(null);
    }, 5000);
  };

  const handleViberOrder = async () => {
    setShowViberPanel(true);
    await handleCopyViberMessage();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Brza porudžbina: ${product.title}`}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/55 backdrop-blur-sm md:p-6"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full md:max-w-4xl max-h-[92vh] md:max-h-[88vh] bg-[#FAF9F6] rounded-t-3xl md:rounded-2xl shadow-2xl border border-[#E6E2D8] flex flex-col overflow-hidden">
        <div className="md:hidden pt-2.5 pb-1 flex justify-center bg-[#FAF9F6] shrink-0">
          <span className="w-10 h-1.5 rounded-full bg-[#D5CFC3]" aria-hidden="true" />
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-[#E6E2D8] bg-[#FAF9F6] flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#9F1239]">
              {confirmedOrder ? 'Porudžbina potvrđena' : 'Brza porudžbina u 1 koraku'}
            </p>
            <p className="text-xs text-[#6B6862]">
              Plaćanje pouzećem · Post Express dostava
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zatvori prozor za poručivanje"
            className="w-10 h-10 rounded-full bg-white border border-[#E2DDD3] hover:border-[#121212] flex items-center justify-center text-[#121212] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {confirmedOrder ? (
            <div className="p-6 sm:p-10 max-w-xl mx-auto text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-700">
                <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
              </div>

              <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#121212] mt-4">
                Hvala vam na porudžbini!
              </h2>
              <p className="text-sm text-[#6B6862] mt-2">
                Vaša porudžbina je uspešno evidentirana i prosleđena na pakovanje.
                Kurirska služba Post Express isporučuje paket u roku od 24–48h.
              </p>

              <div className="mt-6 bg-white border border-[#E6E2D8] rounded-xl p-5 text-left space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE3]">
                  <span className="text-xs font-semibold text-[#121212]">
                    {settings.brandName} · {settings.brandSubtitle}
                  </span>
                  <span className="text-xs text-[#6B6862]">
                    Broj:{' '}
                    <strong className="text-sm font-bold text-[#121212] tabular-nums">
                      {confirmedOrder.id}
                    </strong>
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <img
                    src={confirmedOrder.productImage}
                    alt={confirmedOrder.productTitle}
                    referrerPolicy="no-referrer"
                    className="w-14 h-18 object-cover rounded-lg bg-[#F3F2EE] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#121212] leading-snug">
                      {confirmedOrder.productTitle}
                    </p>
                    <p className="text-xs text-[#6B6862] mt-1">
                      Veličina: <strong className="text-[#121212]">{confirmedOrder.selectedSize}</strong> · Paket:{' '}
                      <strong className="text-[#121212]">
                        {confirmedOrder.bundleQuantity === 1
                          ? '1 komad'
                          : `${confirmedOrder.bundleQuantity} komada`}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#F0ECE3] text-xs space-y-1.5 text-[#6B6862]">
                  <div className="flex justify-between">
                    <span>Primalac:</span>
                    <span className="text-[#121212] font-medium">
                      {confirmedOrder.customer.fullName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adresa:</span>
                    <span className="text-[#121212] font-medium text-right">
                      {confirmedOrder.customer.street}, {confirmedOrder.customer.cityZip}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Telefon:</span>
                    <span className="text-[#121212] font-medium tabular-nums">
                      {confirmedOrder.customer.phone}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#F0ECE3] text-sm">
                    <span className="font-semibold text-[#121212]">
                      Ukupno pouzećem:
                    </span>
                    <span className="font-bold text-[#9F1239] tabular-nums">
                      {formatRsd(confirmedOrder.pricing.total)}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#6B6862] mt-4">
                Sačuvajte broj porudžbine <strong className="text-[#121212]">{confirmedOrder.id}</strong> za brzo praćenje pošiljke.
              </p>

              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full sm:w-auto h-12 px-8 rounded-full bg-[#121212] hover:bg-[#2A2A2A] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Nastavi kupovinu
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12">
              <div className="md:col-span-5 p-4 sm:p-6 bg-white md:border-r border-b md:border-b-0 border-[#E6E2D8]">
                <div className="flex md:flex-col gap-4">
                  <div className="relative w-28 sm:w-32 md:w-full aspect-[3/4] rounded-xl overflow-hidden bg-[#F3F2EE] shrink-0">
                    {!imageFailed ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        referrerPolicy="no-referrer"
                        onError={() => setImageFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 text-xs text-center text-[#6B6862]">
                        {product.title}
                      </div>
                    )}
                    {discount > 0 && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#9F1239] text-white text-[11px] font-semibold tabular-nums">
                        -{discount}%
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#6B6862]">{product.category}</p>
                    <h2 className="font-editorial text-lg sm:text-xl font-semibold text-[#121212] mt-1 leading-snug">
                      {product.title}
                    </h2>

                    <div className="mt-2 flex items-baseline gap-2 tabular-nums">
                      <span className="text-lg font-bold text-[#121212]">
                        {formatRsd(product.salePrice)}
                      </span>
                      {product.originalPrice > product.salePrice && (
                        <span className="text-xs text-[#6B6862] line-through">
                          {formatRsd(product.originalPrice)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-[13px] text-[#6B6862] leading-relaxed mt-3">
                      {product.description}
                    </p>

                    <p className="text-xs font-medium text-[#121212] mt-2.5">
                      {product.materialNote}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleWishlist(product)}
                        aria-pressed={isWishlisted}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                          isWishlisted
                            ? 'bg-[#9F1239]/8 border-[#9F1239]/30 text-[#9F1239]'
                            : 'bg-[#FAF9F6] border-[#E2DDD3] text-[#121212] hover:border-[#121212]'
                        }`}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            isWishlisted ? 'fill-[#9F1239] text-[#9F1239]' : ''
                          }`}
                          aria-hidden="true"
                        />
                        <span>{isWishlisted ? 'U željama' : 'Sačuvaj'}</span>
                      </button>

                      {selectedSize && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddToCart(product, selectedSize);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#121212] bg-white hover:bg-[#121212] hover:text-white text-xs font-semibold text-[#121212] transition-colors cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Dodaj u korpu</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Collapsible Size Guide */}
                <div className="mt-4 pt-3 border-t border-[#F0ECE3]">
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide((prev) => !prev)}
                    aria-expanded={showSizeGuide}
                    className="w-full flex items-center justify-between py-2 text-xs font-semibold text-[#121212] hover:text-[#9F1239] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
                      📏 Tabela veličina (S–XXL &amp; Bebi cm)
                    </span>
                    {showSizeGuide ? (
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  {showSizeGuide && (
                    <div className="mt-2 space-y-3 text-[11px] bg-[#FAF9F6] border border-[#E6E2D8] rounded-xl p-3">
                      <table className="w-full text-left tabular-nums">
                        <thead>
                          <tr className="text-[#6B6862] border-b border-[#E6E2D8]">
                            <th className="py-1 pr-2">Vel.</th>
                            <th className="py-1 pr-2">EU</th>
                            <th className="py-1 pr-2">Grudi</th>
                            <th className="py-1 pr-2">Struk</th>
                            <th className="py-1">Kukovi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFECE4]">
                          {ADULT_SIZE_GUIDE_ROWS.map((row) => (
                            <tr key={row.size}>
                              <td className="py-1 pr-2 font-semibold">{row.size}</td>
                              <td className="py-1 pr-2 text-[#6B6862]">{row.eu}</td>
                              <td className="py-1 pr-2">{row.chest}</td>
                              <td className="py-1 pr-2">{row.waist}</td>
                              <td className="py-1">{row.hips}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <table className="w-full text-left tabular-nums">
                        <thead>
                          <tr className="text-[#6B6862] border-b border-[#E6E2D8]">
                            <th className="py-1 pr-2">Uzrast</th>
                            <th className="py-1 pr-2">Visina</th>
                            <th className="py-1">Težina</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFECE4]">
                          {BABY_SIZE_GUIDE_ROWS.map((row) => (
                            <tr key={row.age}>
                              <td className="py-1 pr-2 font-semibold">{row.age}</td>
                              <td className="py-1 pr-2">{row.height}</td>
                              <td className="py-1">{row.weight}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <form
                onSubmit={handleConfirmOrder}
                noValidate
                className="md:col-span-7 p-4 sm:p-6 space-y-5"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#121212]">
                      1. Izaberite veličinu *
                    </span>
                    {selectedSize && (
                      <span className="text-xs text-[#6B6862] tabular-nums">
                        Na stanju:{' '}
                        <strong className="text-[#121212]">
                          {selectedSizeStock} kom
                        </strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {sizeEntries.map(([size, qty]) => {
                      const available = qty > 0;
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          disabled={!available}
                          onClick={() => {
                            setSelectedSize(size);
                            if (bundleQuantity > qty) setBundleQuantity(1);
                            setErrors((prev) => ({ ...prev, size: undefined, submit: undefined }));
                          }}
                          className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-center transition-all cursor-pointer ${
                            !available
                              ? 'bg-[#F3F2EE] border-[#E6E2D8] text-[#6B6862]/45 line-through cursor-not-allowed'
                              : isSelected
                                ? 'bg-[#121212] border-[#121212] text-white shadow-sm'
                                : 'bg-white border-[#D8D2C5] text-[#121212] hover:border-[#121212]'
                          }`}
                        >
                          <div className="text-xs font-bold leading-tight">{size}</div>
                          {available && (
                            <div
                              className={`text-[10px] mt-0.5 tabular-nums ${
                                isSelected ? 'text-white/80' : 'text-[#6B6862]'
                              }`}
                            >
                              (još {qty})
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {errors.size && (
                    <p className="mt-1.5 text-xs font-medium text-[#9F1239]">
                      {errors.size}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-[#121212]">
                      2. Paket ponude (Uštedite više)
                    </span>
                    {selectedSizeStock > 0 && selectedSizeStock < 3 && (
                      <span className="text-[11px] text-[#6B6862]">
                        Za kombinaciju različitih modela koristite Korpu
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {BUNDLE_OPTIONS.map((opt) => {
                      const active = bundleQuantity === opt.qty;
                      const disabled = selectedSizeStock < opt.qty;
                      const preview = calculateOrderTotals(product.salePrice, opt.qty, settings);
                      return (
                        <button
                          key={opt.qty}
                          type="button"
                          disabled={disabled}
                          onClick={() => setBundleQuantity(opt.qty)}
                          aria-pressed={active}
                          className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                            active
                              ? 'bg-white border-[#9F1239] ring-1 ring-[#9F1239]'
                              : 'bg-white border-[#E2DDD3] hover:border-[#121212]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-bold text-[#121212] whitespace-nowrap">
                              {opt.title}
                            </span>
                            {opt.badge && (
                              <span className="text-[9px] font-bold tracking-tight text-[#9F1239] tabular-nums whitespace-nowrap">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6B6862] mt-0.5 leading-snug">
                            {disabled ? `Nema ${opt.qty} kom u ${selectedSize}` : opt.subtitle}
                          </p>
                          <p className="text-xs font-bold text-[#121212] mt-1.5 tabular-nums">
                            {formatRsd(preview.subtotal)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-[#121212]">
                      3. Podaci za dostavu (Plaćanje pouzećem)
                    </span>
                    {rememberDetails && (
                      <button
                        type="button"
                        onClick={() => {
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
                        }}
                        className="text-[11px] text-[#9F1239] hover:underline cursor-pointer"
                      >
                        Obriši sačuvane podatke
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="order-fullName" className="block text-xs font-medium text-[#121212] mb-1">
                        Ime i prezime *
                      </label>
                      <input
                        id="order-fullName"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Npr. Jelena Marković"
                        className="w-full h-11 px-3.5 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] focus:outline-none focus:border-[#121212]"
                      />
                      {errors.fullName && (
                        <p className="mt-1 text-[11px] font-medium text-[#9F1239]">{errors.fullName}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="order-phone" className="block text-xs font-medium text-[#121212] mb-1">
                        Broj telefona (06x...) *
                      </label>
                      <input
                        id="order-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="064 123 4567"
                        className="w-full h-11 px-3.5 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] focus:outline-none focus:border-[#121212]"
                      />
                      {errors.phone && (
                        <p className="mt-1 text-[11px] font-medium text-[#9F1239]">{errors.phone}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="order-street" className="block text-xs font-medium text-[#121212] mb-1">
                        Ulica i kućni broj *
                      </label>
                      <input
                        id="order-street"
                        type="text"
                        required
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Npr. Knez Mihailova 14, stan 3"
                        className="w-full h-11 px-3.5 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] focus:outline-none focus:border-[#121212]"
                      />
                      {errors.street && (
                        <p className="mt-1 text-[11px] font-medium text-[#9F1239]">{errors.street}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="order-cityZip" className="block text-xs font-medium text-[#121212] mb-1">
                        Grad i poštanski broj *
                      </label>
                      <input
                        id="order-cityZip"
                        type="text"
                        required
                        value={cityZip}
                        onChange={(e) => setCityZip(e.target.value)}
                        placeholder="Npr. Beograd 11000"
                        className="w-full h-11 px-3.5 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] focus:outline-none focus:border-[#121212]"
                      />
                      {errors.cityZip && (
                        <p className="mt-1 text-[11px] font-medium text-[#9F1239]">{errors.cityZip}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="order-note" className="block text-xs font-medium text-[#121212] mb-1">
                      Napomena za kurira (opciono)
                    </label>
                    <input
                      id="order-note"
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Npr. Pozvati pre isporuke"
                      className="w-full h-11 px-3.5 bg-white border border-[#D8D2C5] rounded-xl text-sm text-[#121212] focus:outline-none focus:border-[#121212]"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 text-[11px] text-[#6B6862] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberDetails}
                      onChange={(e) => setRememberDetails(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#9F1239]"
                    />
                    <span>Zapamti podatke na ovom uređaju za brže poručivanje</span>
                  </label>
                </div>

                <div className="bg-white border border-[#E2DDD3] rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-2 text-[#6B6862]">
                    <span>Artikal &amp; Veličina:</span>
                    <span className="text-[#121212] font-medium text-right">
                      {product.title} ({selectedSize ?? '—'}) × {bundleQuantity}
                    </span>
                  </div>

                  {pricing.discountAmount > 0 && (
                    <div className="flex justify-between gap-2 text-emerald-700 font-medium tabular-nums">
                      <span>Paket popust (-{pricing.discountPercent}%):</span>
                      <span>-{formatRsd(pricing.discountAmount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-2 text-[#6B6862] tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                      Dostava Post Express:
                    </span>
                    {pricing.isFreeShipping ? (
                      <span className="text-emerald-700 font-semibold">
                        0 RSD — BESPLATNA DOSTAVA
                      </span>
                    ) : (
                      <span className="text-[#121212] font-medium">
                        {formatRsd(pricing.shippingCost)}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#F0ECE3] flex items-center justify-between text-sm">
                    <span className="font-bold text-[#121212]">
                      UKUPNO ZA PLAĆANJE POUZEĆEM:
                    </span>
                    <span className="text-base font-bold text-[#9F1239] tabular-nums">
                      {formatRsd(pricing.total)}
                    </span>
                  </div>
                </div>

                {errors.submit && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-[#9F1239]"
                  >
                    {errors.submit}
                  </div>
                )}

                {viberToast && (
                  <div
                    role="status"
                    className="p-3 rounded-xl bg-[#7360F2]/10 border border-[#7360F2]/30 text-xs font-medium text-[#4A38C2] flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{viberToast}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 rounded-xl bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white text-sm font-semibold tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {isSubmitting
                        ? 'Obrada porudžbine...'
                        : 'POTVRDI PORUDŽBINU (Plaćanje pouzećem)'}
                    </span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleViberOrder()}
                      className="w-full h-11 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                      <span>Poruči preko Vibera</span>
                    </button>

                    <a
                      href={telHref}
                      className="w-full h-11 rounded-xl border border-[#D8D2C5] bg-white hover:border-[#121212] text-[#121212] text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <PhoneCall className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
                      <span>Pozovi nas ({settings.contactPhoneDisplay})</span>
                    </a>
                  </div>

                  {showViberPanel && (
                    <div className="p-3.5 rounded-xl bg-white border border-[#7360F2]/35 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#121212]">
                          Pripremljena poruka za Viber ({settings.contactPhoneDisplay})
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyViberMessage()}
                          className="inline-flex items-center gap-1 font-semibold text-[#9F1239] hover:underline cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Kopiraj poruku</span>
                        </button>
                      </div>
                      <textarea
                        readOnly
                        rows={6}
                        value={preparedViberMessage}
                        aria-label="Pripremljena Viber poruka"
                        className="w-full p-2.5 rounded-lg bg-[#FAF9F6] border border-[#E2DDD3] text-[11px] text-[#121212] leading-relaxed"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <a
                          href={viberChatHref}
                          className="h-9 px-3 rounded-lg bg-[#7360F2] hover:bg-[#5E4BD8] text-white font-semibold flex items-center justify-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Otvori Viber razgovor</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                        <a
                          href={viberForwardHref}
                          className="h-9 px-3 rounded-lg border border-[#D8D2C5] bg-[#FAF9F6] hover:border-[#7360F2] text-[#121212] font-semibold flex items-center justify-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-[#7360F2]" aria-hidden="true" />
                          <span>Prosledi tekst u Viber</span>
                        </a>
                      </div>
                      <p className="flex items-start gap-1.5 text-[11px] text-[#6B6862]">
                        <Info className="w-3.5 h-3.5 text-[#9F1239] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          Otvaranje Vibera ne kreira automatski porudžbinu i ne umanjuje zalihe dok je ne potvrdimo u razgovoru.
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-[11px] text-[#6B6862]">
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    Plaćanje tek kad kurir donese paket
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" aria-hidden="true" />
                    Mogućnost zamene veličine
                  </span>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
