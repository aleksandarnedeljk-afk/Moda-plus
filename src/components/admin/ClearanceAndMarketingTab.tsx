import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Flame,
  Image as ImageIcon,
  RotateCcw,
  Tag,
} from 'lucide-react';
import type {
  AdminProduct,
  CouponCode,
  PriceChangeBatch,
  PromotionRule,
  StoreSettings,
} from '../../types/store';
import {
  applyClearanceApi,
  createCouponApi,
  createPromotionApi,
  previewClearanceApi,
  rollbackClearanceApi,
  updateCouponApi,
  updatePromotionApi,
} from '../../utils/api';
import type { ClearancePreviewRow } from '../../utils/financeLogic';
import {
  formatRsd,
  getDiscountPercent,
  getProductPath,
  getTotalStock,
} from '../../utils/storeLogic';

interface ClearanceAndMarketingTabProps {
  mode: 'clearance' | 'marketing';
  products: AdminProduct[];
  priceHistory: PriceChangeBatch[];
  promotions: PromotionRule[];
  coupons: CouponCode[];
  settings: StoreSettings;
  onDataChanged: () => void;
}

export function ClearanceAndMarketingTab({
  mode,
  products,
  priceHistory,
  promotions,
  coupons,
  settings,
  onDataChanged,
}: ClearanceAndMarketingTabProps) {
  // Clearance state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [ruleMode, setRuleMode] = useState<'percent' | 'fixed_rsd'>('percent');
  const [ruleValue, setRuleValue] = useState('15');
  const [roundTo90, setRoundTo90] = useState(true);
  const [batchLabel, setBatchLabel] = useState('Vikend rasprodaja zaliha');
  const [previewRows, setPreviewRows] = useState<ClearancePreviewRow[] | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Promotions & Coupons state
  const [promoName, setPromoName] = useState('');
  const [promoMinRsd, setPromoMinRsd] = useState('5000');
  const [promoPercent, setPromoPercent] = useState('10');
  const [couponCode, setCouponCode] = useState('');
  const [couponValue, setCouponValue] = useState('10');
  const [couponMinRsd, setCouponMinRsd] = useState('2000');

  // Marketing Studio state
  const [studioProductId, setStudioProductId] = useState(products[0]?.id || '');
  const [canvasFormat, setCanvasFormat] = useState<'post' | 'portrait' | 'story'>('post');
  const [canvasCta, setCanvasCta] = useState('POSLEDNJI KOMADI · PLAĆANJE POUZEĆEM');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [generatedPngUrl, setGeneratedPngUrl] = useState<string | null>(null);

  const lastPieceProducts = useMemo(
    () =>
      products.filter((p) => getTotalStock(p.stockBySize, p.variants) === 1),
    [products],
  );
  const overstockProducts = useMemo(
    () =>
      products.filter((p) => getTotalStock(p.stockBySize, p.variants) >= 6),
    [products],
  );

  const handlePreviewClearance = async () => {
    setFeedback(null);
    if (selectedProductIds.length === 0) {
      setFeedback({ type: 'error', message: 'Izaberite bar jedan artikal za sniženje.' });
      return;
    }
    try {
      const rows = await previewClearanceApi({
        targetProductIds: selectedProductIds,
        mode: ruleMode,
        value: Number(ruleValue) || 10,
        roundToEnding90: roundTo90,
      });
      setPreviewRows(rows);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri pregledu.',
      });
    }
  };

  const handleApplyClearance = async () => {
    if (selectedProductIds.length === 0) return;
    try {
      const res = await applyClearanceApi({
        label: batchLabel.trim() || 'Akcijsko sniženje',
        targetProductIds: selectedProductIds,
        mode: ruleMode,
        value: Number(ruleValue) || 10,
        roundToEnding90: roundTo90,
      });
      setPreviewRows(null);
      setSelectedProductIds([]);
      setFeedback({
        type: 'success',
        message: `Primena uspešna (${res.batch.entries.length} artikala). Možete vratiti cene jednim klikom ako želite.`,
      });
      onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri primeni sniženja.',
      });
    }
  };

  const renderMarketingCanvas = async () => {
    const prod = products.find((p) => p.id === studioProductId);
    if (!prod || !canvasRef.current) return;

    const dims =
      canvasFormat === 'post'
        ? { w: 1080, h: 1080 }
        : canvasFormat === 'portrait'
          ? { w: 1080, h: 1350 }
          : { w: 1080, h: 1920 };

    const canvas = canvasRef.current;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, dims.w, dims.h);

    // Top dark header with architectural monogram emblem
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, dims.w, 146);
    const monogram = (settings.logoMonogram || 'MP').trim().slice(0, 4).toUpperCase();
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 3;
    ctx.strokeRect(52, 34, 78, 78);
    ctx.fillStyle = '#FAF9F6';
    ctx.font = '600 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(monogram, 91, 84);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 42px Georgia, serif';
    ctx.fillText(settings.brandName, dims.w / 2 + 20, 68);
    ctx.fillStyle = '#C5A059';
    ctx.font = '600 20px sans-serif';
    ctx.fillText(
      `${settings.brandSubtitle} · Tel/Viber: ${settings.contactPhoneDisplay}`,
      dims.w / 2 + 20,
      106,
    );

    // Load real product photo cleanly without retouching/altering the garment itself
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = prod.imageUrl;
    });

    const imgTop = 160;
    const imgHeight = dims.h - 460;
    const imgWidth = dims.w - 140;
    if (img.naturalWidth > 0) {
      const scale = Math.min(imgWidth / img.naturalWidth, imgHeight / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (dims.w - dw) / 2;
      const dy = imgTop + (imgHeight - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    // Discount badge
    const disc = getDiscountPercent(prod.originalPrice, prod.salePrice);
    if (disc > 0) {
      ctx.fillStyle = '#9F1239';
      ctx.fillRect(70, imgTop + 20, 170, 62);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`-${disc}%`, 155, imgTop + 63);
    }

    // Bottom Typography Card
    const footerY = dims.h - 270;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(50, footerY, dims.w - 100, 225);
    ctx.strokeStyle = '#E6E2D8';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, footerY, dims.w - 100, 225);

    ctx.fillStyle = '#121212';
    ctx.font = '600 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(prod.title.slice(0, 42), dims.w / 2, footerY + 62);

    ctx.fillStyle = '#9F1239';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(formatRsd(prod.salePrice), dims.w / 2, footerY + 126);

    ctx.fillStyle = '#6B6862';
    ctx.font = '600 24px sans-serif';
    ctx.fillText(canvasCta, dims.w / 2, footerY + 182);

    setGeneratedPngUrl(canvas.toDataURL('image/png'));
  };

  if (mode === 'marketing') {
    const studioProd = products.find((p) => p.id === studioProductId);
    const adCopy = studioProd
      ? `✨ ${settings.brandName} — ${studioProd.title} ✨\n🔥 Akcijska cena: ${formatRsd(studioProd.salePrice)} (redovna ${formatRsd(studioProd.originalPrice)})\n✅ ${settings.brandSubtitle}\n📦 Plaćanje pouzećem — Post Express 24-48h\n📞 Telefon & Viber: ${settings.contactPhoneDisplay}\n👉 Poruči direktno bez registracije: ${window.location.origin}${getProductPath(studioProd)}\n\n#modaplusoutlet #velikarasprodajazaliha #modazaceluporodicu #rasprodaja #butiksrbija #akcija`
      : '';

    return (
      <div className="space-y-5">
        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
            {feedback.message}
          </div>
        )}

        {/* FB / IG Graphics & Copy Generator */}
        <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#9F1239]" />
              <span>Marketing Studio — FB / IG oglasi i Story grafike</span>
            </h2>
            <p className="text-xs text-[#6B6862]">
              Generiše spremne PNG slike (1080×1080, 1080×1350, 1080×1920) sa originalnom
              fotografijom i cenom, plus tekst za objavu.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <select
              value={studioProductId}
              onChange={(e) => setStudioProductId(e.target.value)}
              className="h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({formatRsd(p.salePrice)})
                </option>
              ))}
            </select>
            <select
              value={canvasFormat}
              onChange={(e) => setCanvasFormat(e.target.value as typeof canvasFormat)}
              className="h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl"
            >
              <option value="post">Instagram / FB Post (1080×1080)</option>
              <option value="portrait">Portrait Feed (1080×1350)</option>
              <option value="story">Story / Reels Cover (1080×1920)</option>
            </select>
            <input
              type="text"
              value={canvasCta}
              onChange={(e) => setCanvasCta(e.target.value)}
              className="h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void renderMarketingCanvas()}
              className="h-10 px-4 rounded-xl bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
            >
              Generiši reklamnu sliku
            </button>
            {generatedPngUrl && (
              <a
                href={generatedPngUrl}
                download={`modaplus-oglas-${canvasFormat}.png`}
                className="h-10 px-4 rounded-xl bg-[#121212] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Preuzmi PNG</span>
              </a>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
          {generatedPngUrl && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <img
                src={generatedPngUrl}
                alt="Generisana reklamna grafika"
                className="w-full max-w-xs rounded-xl border border-[#E6E2D8] shadow-sm"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold">Tekst objave za Facebook / Instagram:</p>
                <textarea
                  readOnly
                  rows={7}
                  value={adCopy}
                  className="w-full p-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(adCopy).catch(() => undefined);
                    setFeedback({ type: 'success', message: 'Tekst oglasa kopiran!' });
                  }}
                  className="h-9 px-3 rounded-xl border border-[#121212] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Kopiraj tekst oglasa</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Coupons & Promotions */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3 text-xs">
            <h3 className="font-editorial text-base font-semibold">Kupon kodovi</h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="KOD (npr. VIP10)"
                className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
              <input
                type="number"
                value={couponValue}
                onChange={(e) => setCouponValue(e.target.value)}
                placeholder="Popust %"
                className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
              <input
                type="number"
                value={couponMinRsd}
                onChange={(e) => setCouponMinRsd(e.target.value)}
                placeholder="Min RSD"
                className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!couponCode.trim()) return;
                await createCouponApi({
                  code: couponCode.trim(),
                  discountType: 'percent',
                  value: Number(couponValue) || 10,
                  minOrderRsd: Number(couponMinRsd) || 0,
                  active: true,
                });
                setCouponCode('');
                onDataChanged();
              }}
              className="h-9 px-4 rounded-xl bg-[#121212] text-white font-semibold cursor-pointer"
            >
              Dodaj kupon
            </button>
            <div className="space-y-1.5 pt-2">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#FAF9F6] border border-[#E6E2D8]"
                >
                  <span>
                    <strong>{c.code}</strong> · -{c.value}% (min {formatRsd(c.minOrderRsd)})
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await updateCouponApi(c.id, { active: !c.active });
                      onDataChanged();
                    }}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      c.active ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {c.active ? 'Aktivan' : 'Neaktivan'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3 text-xs">
            <h3 className="font-editorial text-base font-semibold">Automatske akcije korpe</h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={promoName}
                onChange={(e) => setPromoName(e.target.value)}
                placeholder="Naziv akcije"
                className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
              <input
                type="number"
                value={promoPercent}
                onChange={(e) => setPromoPercent(e.target.value)}
                placeholder="Popust %"
                className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
              <input
                type="number"
                value={promoMinRsd}
                onChange={(e) => setPromoMinRsd(e.target.value)}
                placeholder="Prag RSD"
                className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!promoName.trim()) return;
                await createPromotionApi({
                  name: promoName.trim(),
                  type: 'cart_threshold_percent',
                  discountPercent: Number(promoPercent) || 10,
                  minCartRsd: Number(promoMinRsd) || 5000,
                  active: true,
                });
                setPromoName('');
                onDataChanged();
              }}
              className="h-9 px-4 rounded-xl bg-[#121212] text-white font-semibold cursor-pointer"
            >
              Dodaj akciju korpe
            </button>
            <div className="space-y-1.5 pt-2">
              {promotions.map((pr) => (
                <div
                  key={pr.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#FAF9F6] border border-[#E6E2D8]"
                >
                  <span>
                    <strong>{pr.name}</strong> ({pr.discountPercent}% preko {formatRsd(pr.minCartRsd || 0)})
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await updatePromotionApi(pr.id, { active: !pr.active });
                      onDataChanged();
                    }}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      pr.active ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {pr.active ? 'Aktivna' : 'Neaktivna'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-[#9F1239]'
          }`}
        >
          {feedback.type === 'success' && <Check className="w-4 h-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Clearance Automation */}
      <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#9F1239]" />
              <span>Rasprodaja zaliha — pametno sniženje cena</span>
            </h2>
            <p className="text-xs text-[#6B6862]">
              Izaberite poslednje komade ili modele sa većim zalihama, pregledajte maržu i
              primenite sniženje jednim klikom (uz mogućnost vraćanja).
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedProductIds(lastPieceProducts.map((p) => p.id))}
              className="h-8 px-3 rounded-lg bg-rose-50 border border-rose-200 text-[#9F1239] font-semibold cursor-pointer"
            >
              Poslednji komad ({lastPieceProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedProductIds(overstockProducts.map((p) => p.id))}
              className="h-8 px-3 rounded-lg bg-[#FAF9F6] border border-[#D8D2C5] font-semibold cursor-pointer"
            >
              Više zaliha ≥6 ({overstockProducts.length})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <input
            type="text"
            value={batchLabel}
            onChange={(e) => setBatchLabel(e.target.value)}
            placeholder="Naziv akcije"
            className="h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl"
          />
          <select
            value={ruleMode}
            onChange={(e) => setRuleMode(e.target.value as 'percent' | 'fixed_rsd')}
            className="h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl"
          >
            <option value="percent">Smanji za procenat (%)</option>
            <option value="fixed_rsd">Smanji za iznos (RSD)</option>
          </select>
          <input
            type="number"
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder="Vrednost"
            className="h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl font-bold"
          />
          <label className="flex items-center gap-2 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={roundTo90}
              onChange={(e) => setRoundTo90(e.target.checked)}
              className="w-4 h-4 accent-[#9F1239]"
            />
            <span>Zaokruži na .90</span>
          </label>
        </div>

        <div className="max-h-56 overflow-y-auto divide-y divide-[#F0ECE3] border border-[#E6E2D8] rounded-xl">
          {products
            .filter((p) => getTotalStock(p.stockBySize, p.variants) > 0)
            .map((p) => {
              const checked = selectedProductIds.includes(p.id);
              const avail = getTotalStock(p.stockBySize, p.variants);
              return (
                <label
                  key={p.id}
                  className="flex items-center justify-between p-2.5 text-xs hover:bg-[#FAF9F6] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedProductIds((prev) =>
                          checked ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                        )
                      }
                      className="w-4 h-4 accent-[#9F1239]"
                    />
                    <span className="font-medium text-[#121212]">{p.title}</span>
                    <span className="text-[11px] text-[#6B6862]">({avail} kom)</span>
                  </div>
                  <strong className="tabular-nums">{formatRsd(p.salePrice)}</strong>
                </label>
              );
            })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handlePreviewClearance()}
            className="h-10 px-4 rounded-xl bg-[#121212] text-white text-xs font-semibold cursor-pointer"
          >
            Pregled novih cena ({selectedProductIds.length})
          </button>
          {previewRows && previewRows.length > 0 && (
            <button
              type="button"
              onClick={() => void handleApplyClearance()}
              className="h-10 px-4 rounded-xl bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
            >
              Primeni sniženje sada
            </button>
          )}
        </div>

        {previewRows && (
          <div className="space-y-2 pt-2">
            {previewRows.map((row) => (
              <div
                key={row.productId}
                className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="font-semibold">{row.productTitle}</p>
                  {row.warning && (
                    <p className="text-[#9F1239] font-semibold inline-flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {row.warning}
                    </p>
                  )}
                </div>
                <div className="text-right tabular-nums">
                  <span className="line-through text-[#6B6862] mr-2">
                    {formatRsd(row.currentSalePrice)}
                  </span>
                  <strong className="text-[#9F1239]">{formatRsd(row.proposedSalePrice)}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Price Change Batch History & Rollback */}
      {priceHistory.length > 0 && (
        <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-3">
          <h3 className="font-editorial text-base font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#C5A059]" />
            <span>Istorija grupnih sniženja (1-klik vraćanje cena)</span>
          </h3>
          <div className="space-y-2">
            {priceHistory.map((batch) => (
              <div
                key={batch.id}
                className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="font-semibold">
                    {batch.label} ({batch.ruleSummary})
                  </p>
                  <p className="text-[11px] text-[#6B6862]">
                    {new Date(batch.appliedAt).toLocaleString('sr-RS')} · Artikala:{' '}
                    {batch.entries.length}
                    {batch.rolledBackAt
                      ? ` · Vraćeno ${new Date(batch.rolledBackAt).toLocaleDateString('sr-RS')}`
                      : ''}
                  </p>
                </div>
                {!batch.rolledBackAt && (
                  <button
                    type="button"
                    onClick={async () => {
                      await rollbackClearanceApi(batch.id);
                      setFeedback({
                        type: 'success',
                        message: `Vraćene prethodne cene za akciju „${batch.label}“.`,
                      });
                      onDataChanged();
                    }}
                    className="h-8 px-3 rounded-lg border border-[#121212] bg-white hover:bg-[#121212] hover:text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Vrati stare cene</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
