import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Edit3,
  ImagePlus,
  Layers,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ALL_PRODUCT_SIZES } from '../../config/storeConfig';
import type {
  AdminProduct,
  AdminRole,
  CategoryConfig,
  GenderAgeGroup,
  ProductCategory,
  ProductLifecycleStatus,
  ProductSize,
  SizeGuideType,
} from '../../types/store';
import {
  aiSuggestProductApi,
  bulkUploadProductsApi,
  createProductApi,
  deleteProductApi,
  updateProductApi,
} from '../../utils/api';
import { compressImageFileToDataUrl } from '../../utils/imageCompress';
import {
  formatRsd,
  getDiscountPercent,
  getTotalStock,
  normalizeSerbianLatin,
} from '../../utils/storeLogic';

interface ProductEntryAndCatalogTabProps {
  mode: 'add' | 'catalog';
  userRole: AdminRole;
  products: AdminProduct[];
  categories: CategoryConfig[];
  onProductsChanged: () => void;
}

export function ProductEntryAndCatalogTab({
  mode,
  userRole,
  products,
  categories,
  onProductsChanged,
}: ProductEntryAndCatalogTabProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const bulkGalleryRef = useRef<HTMLInputElement | null>(null);

  // Entry & Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<ProductCategory>(
    categories[0]?.name || 'Ženske haljine',
  );
  const [genderAge, setGenderAge] = useState<GenderAgeGroup>('Žene');
  const [color, setColor] = useState('Osnovna');
  const [sizeGuideType, setSizeGuideType] = useState<SizeGuideType>('žene');
  const [description, setDescription] = useState('');
  const [materialNote, setMaterialNote] = useState('Novo sa etiketom · Realan kroj');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [minAllowedPrice, setMinAllowedPrice] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [status, setStatus] = useState<ProductLifecycleStatus>('Aktivan');
  const [isNewFlag, setIsNewFlag] = useState(true);
  const [stockMatrix, setStockMatrix] = useState<Partial<Record<ProductSize, number>>>({
    S: 1,
    M: 2,
    L: 1,
  });

  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Bulk Multi-Photo state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState<
    {
      id: string;
      imageUrl: string;
      title: string;
      category: string;
      salePrice: string;
      originalPrice: string;
      size: ProductSize;
      qty: number;
    }[]
  >([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Catalog filter state
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('Sve');
  const [statusFilter, setStatusFilter] = useState<'Sve' | ProductLifecycleStatus>('Sve');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 6)) {
        const compressed = await compressImageFileToDataUrl(file, 960, 0.82);
        urls.push(compressed);
      }
      setGallery((prev) => [...prev, ...urls].slice(0, 6));
      setFeedback(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Neuspelo učitavanje fotografije.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleBulkFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const nextItems: typeof bulkItems = [];
      for (let i = 0; i < Math.min(files.length, 20); i++) {
        const dataUrl = await compressImageFileToDataUrl(files[i], 880, 0.8);
        const cleanName = files[i].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        nextItems.push({
          id: `blk-${Date.now()}-${i}`,
          imageUrl: dataUrl,
          title: cleanName.length > 2 ? cleanName : `Outlet model ${i + 1}`,
          category: categories[0]?.name || 'Ženske haljine',
          salePrice: '1690',
          originalPrice: '3490',
          size: 'M' as ProductSize,
          qty: 1,
        });
      }
      setBulkItems((prev) => [...prev, ...nextItems]);
    } catch {
      setFeedback({ type: 'error', message: 'Greška pri učitavanju grupnih fotografija.' });
    } finally {
      e.target.value = '';
    }
  };

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setFeedback(null);
    try {
      const suggestion = await aiSuggestProductApi(
        gallery[0],
        `${category} ${title} ${materialNote}`,
      );
      if (suggestion.title) setTitle(suggestion.title);
      if (suggestion.category) setCategory(suggestion.category);
      if (suggestion.color) setColor(suggestion.color);
      if (suggestion.shortDescription) setDescription(suggestion.shortDescription);
      setFeedback({
        type: 'success',
        message: 'AI predlog popunjen — obavezno proverite i po potrebi izmenite pre objave.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'AI predlog trenutno nije dostupan.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const adjustSize = (size: ProductSize, delta: number) => {
    setStockMatrix((prev) => {
      const next = Math.max(0, (prev[size] ?? 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[size];
        return copy;
      }
      return { ...prev, [size]: next };
    });
  };

  const resetForm = (keepCategoryAndNote = false) => {
    setEditingId(null);
    setGallery([]);
    setTitle('');
    setSku('');
    setBrand('');
    setDescription('');
    setSalePrice('');
    setOriginalPrice('');
    setPurchasePrice('');
    setMinAllowedPrice('');
    setInternalNote('');
    if (!keepCategoryAndNote) {
      setCategory(categories[0]?.name || 'Ženske haljine');
      setMaterialNote('Novo sa etiketom · Realan kroj');
      setStockMatrix({ S: 1, M: 2, L: 1 });
    }
  };

  const loadProductIntoForm = (p: AdminProduct, duplicateWithoutStock = false) => {
    setEditingId(duplicateWithoutStock ? null : p.id);
    setGallery(duplicateWithoutStock ? [] : p.galleryImages || [p.imageUrl]);
    setTitle(duplicateWithoutStock ? `${p.title} (kopija)` : p.title);
    setSku(duplicateWithoutStock ? '' : p.sku || '');
    setBrand(p.brand || '');
    setCategory(p.category);
    setGenderAge(p.genderAge || 'Žene');
    setColor(p.color || 'Osnovna');
    setSizeGuideType(p.sizeGuideType || 'žene');
    setDescription(p.description || '');
    setMaterialNote(p.materialNote || '');
    setPurchasePrice(p.purchasePrice != null ? String(p.purchasePrice) : '');
    setSalePrice(String(p.salePrice));
    setOriginalPrice(String(p.originalPrice));
    setMinAllowedPrice(p.minAllowedPrice != null ? String(p.minAllowedPrice) : '');
    setWarehouseLocation(p.warehouseLocation || '');
    setInternalNote(p.internalNote || '');
    setStatus(p.status || (p.active ? 'Aktivan' : 'Skriven'));
    setIsNewFlag(Boolean(p.isNew));
    setStockMatrix(duplicateWithoutStock ? {} : { ...p.stockBySize });
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (andNext: boolean) => {
    setFeedback(null);
    const parsedSale = Number(salePrice);
    if (!title.trim() || title.trim().length < 2) {
      setFeedback({ type: 'error', message: 'Unesite naziv artikla.' });
      return;
    }
    if (!Number.isFinite(parsedSale) || parsedSale <= 0) {
      setFeedback({ type: 'error', message: 'Unesite ispravnu akcijsku cenu u RSD.' });
      return;
    }
    if (getTotalStock(stockMatrix) <= 0 && status === 'Aktivan') {
      setFeedback({
        type: 'error',
        message: 'Dodajte bar 1 komad na stanju ili sačuvajte kao Nacrt.',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<AdminProduct> = {
        title: title.trim(),
        sku: sku.trim() || undefined,
        brand: brand.trim() || undefined,
        category,
        genderAge,
        color: color.trim() || 'Osnovna',
        sizeGuideType,
        description:
          description.trim() ||
          'Nov artikal iz butik likvidacije zaliha, sa originalnom etiketom.',
        materialNote: materialNote.trim() || 'Novo sa etiketom',
        purchasePrice: purchasePrice.trim() !== '' ? Number(purchasePrice) : null,
        minAllowedPrice: minAllowedPrice.trim() !== '' ? Number(minAllowedPrice) : null,
        salePrice: Math.round(parsedSale),
        originalPrice:
          Number(originalPrice) > parsedSale
            ? Math.round(Number(originalPrice))
            : Math.round(parsedSale * 1.8),
        imageUrl:
          gallery[0] || '/src/assets/images/dress_black_midi_1795368188456.jpg',
        galleryImages:
          gallery.length > 0
            ? gallery
            : ['/src/assets/images/dress_black_midi_1795368188456.jpg'],
        stockBySize: stockMatrix,
        status,
        active: status === 'Aktivan',
        isNew: isNewFlag,
        warehouseLocation: warehouseLocation.trim() || undefined,
        internalNote: internalNote.trim() || undefined,
      };

      if (editingId) {
        await updateProductApi(editingId, payload);
        setFeedback({ type: 'success', message: `Artikal „${payload.title}“ je ažuriran.` });
      } else {
        await createProductApi(payload);
        setFeedback({
          type: 'success',
          message: `Artikal „${payload.title}“ je sačuvan (${status}).`,
        });
      }
      onProductsChanged();
      if (andNext) {
        resetForm(true);
      } else if (editingId) {
        setEditingId(null);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri čuvanju artikla.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (bulkItems.length === 0) return;
    setBulkSaving(true);
    setFeedback(null);
    try {
      const created = await bulkUploadProductsApi(
        bulkItems.map((b) => ({
          title: b.title,
          category: b.category,
          salePrice: Number(b.salePrice) || 1490,
          originalPrice: Number(b.originalPrice) || undefined,
          imageUrl: b.imageUrl,
          stockBySize: { [b.size]: Math.max(1, b.qty) },
        })),
      );
      setBulkItems([]);
      setBulkMode(false);
      onProductsChanged();
      setFeedback({
        type: 'success',
        message: `Uspešno objavljeno ${created.length} artikala iz grupne serije!`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Greška pri grupnom unosu.',
      });
    } finally {
      setBulkSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = normalizeSerbianLatin(search);
    return products.filter((p) => {
      if (catFilter !== 'Sve' && p.category !== catFilter) return false;
      if (statusFilter !== 'Sve' && (p.status || 'Aktivan') !== statusFilter) return false;
      if (q) {
        const hay = normalizeSerbianLatin(
          `${p.title} ${p.sku || ''} ${p.brand || ''} ${p.category}`,
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, catFilter, statusFilter]);

  const draftDiscount = getDiscountPercent(Number(originalPrice) || 0, Number(salePrice) || 0);
  const liveMargin =
    purchasePrice.trim() !== '' && Number(salePrice) > 0
      ? Number(salePrice) - Number(purchasePrice)
      : null;

  return (
    <div className="space-y-5">
      {/* Fast Entry / Edit Form (shown in 'add' mode OR when editing from catalog) */}
      {(mode === 'add' || editingId !== null) && (
        <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-editorial text-xl font-semibold text-[#121212]">
                {editingId ? 'Izmena artikla' : 'Fotografiši i dodaj artikal'}
              </h2>
              <p className="text-xs text-[#6B6862]">
                Brzi mobilni unos sa više fotografija, cenama, maržom i matricom veličina.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={() => resetForm(false)}
                  className="h-9 px-3 rounded-xl border border-[#D8D2C5] text-xs font-medium cursor-pointer"
                >
                  Otkaži izmenu
                </button>
              )}
              {!editingId && (
                <button
                  type="button"
                  onClick={() => setBulkMode((b) => !b)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                    bulkMode
                      ? 'bg-[#121212] text-white border-[#121212]'
                      : 'bg-[#FAF9F6] text-[#121212] border-[#D8D2C5]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{bulkMode ? 'Pojedinačni unos' : 'Grupni unos fotografija'}</span>
                </button>
              )}
            </div>
          </div>

          {feedback && (
            <div
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border border-rose-200 text-[#9F1239]'
              }`}
            >
              {feedback.type === 'success' && <Check className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          {bulkMode ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-dashed border-[#D2CCC0] text-center space-y-2">
                <input
                  ref={bulkGalleryRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleBulkFiles}
                  className="hidden"
                />
                <p className="text-xs text-[#6B6862]">
                  Izaberite do 20 fotografija iz galerije telefona odjednom — za svaku sliku
                  automatski se pravi poseban artikal.
                </p>
                <button
                  type="button"
                  onClick={() => bulkGalleryRef.current?.click()}
                  className="h-10 px-4 rounded-xl bg-[#121212] text-white text-xs font-semibold cursor-pointer"
                >
                  Izaberi više fotografija
                </button>
              </div>

              {bulkItems.length > 0 && (
                <div className="space-y-2.5">
                  {bulkItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-[#E6E2D8] bg-[#FAF9F6] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-14 h-16 object-cover rounded-lg sm:col-span-1"
                      />
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, title: val } : x)),
                          );
                        }}
                        placeholder="Naziv"
                        className="h-9 px-2.5 rounded-lg bg-white border border-[#D8D2C5] text-xs sm:col-span-4"
                      />
                      <select
                        value={item.category}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, category: val } : x)),
                          );
                        }}
                        className="h-9 px-2 rounded-lg bg-white border border-[#D8D2C5] text-xs sm:col-span-3"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.salePrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, salePrice: val } : x)),
                          );
                        }}
                        placeholder="Cena"
                        className="h-9 px-2 rounded-lg bg-white border border-[#D8D2C5] text-xs tabular-nums sm:col-span-2"
                      />
                      <div className="flex items-center gap-1.5 sm:col-span-2">
                        <select
                          value={item.size}
                          onChange={(e) => {
                            const val = e.target.value as ProductSize;
                            setBulkItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, size: val } : x)),
                            );
                          }}
                          className="h-9 px-2 rounded-lg bg-white border border-[#D8D2C5] text-xs flex-1"
                        >
                          {ALL_PRODUCT_SIZES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setBulkItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="w-8 h-8 rounded-lg border border-[#D8D2C5] flex items-center justify-center text-[#6B6862] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={() => void handleBulkSave()}
                    className="w-full h-11 rounded-xl bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
                  >
                    {bulkSaving
                      ? 'Objavljivanje...'
                      : `Objavi celu seriju (${bulkItems.length} artikala)`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Left: Multi-photo upload */}
              <div className="md:col-span-4 space-y-3">
                <div className="rounded-xl bg-[#F3F2EE] border border-dashed border-[#D2CCC0] aspect-[3/4] overflow-hidden flex items-center justify-center relative">
                  {gallery[0] ? (
                    <img
                      src={gallery[0]}
                      alt="Glavna fotografija"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="p-4 text-center space-y-2">
                      <Camera className="w-9 h-9 text-[#6B6862] mx-auto" aria-hidden="true" />
                      <p className="text-xs text-[#6B6862]">
                        Dodajte do 6 fotografija sa kamere ili iz galerije
                      </p>
                    </div>
                  )}
                </div>

                {gallery.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {gallery.map((img, i) => (
                      <div key={i} className="relative shrink-0">
                        <img
                          src={img}
                          alt={`Slika ${i + 1}`}
                          onClick={() => {
                            if (i === 0) return;
                            const next = [img, ...gallery.filter((_, idx) => idx !== i)];
                            setGallery(next);
                          }}
                          className={`w-12 h-14 object-cover rounded-lg cursor-pointer border-2 ${
                            i === 0 ? 'border-[#9F1239]' : 'border-transparent'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setGallery((g) => g.filter((_, idx) => idx !== i))}
                          aria-label="Ukloni sliku"
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#121212] text-white text-[10px] flex items-center justify-center cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="h-11 rounded-xl bg-[#121212] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Kamera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="h-11 rounded-xl bg-[#F3F2EE] text-[#121212] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Galerija</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void handleAiSuggest()}
                  className="w-full h-10 rounded-xl border border-[#C5A059] bg-[#FAF9F6] hover:bg-[#F3EFE4] text-xs font-semibold text-[#121212] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" aria-hidden="true" />
                  <span>{aiLoading ? 'AI analizira...' : 'AI predlog opisa (opciono)'}</span>
                </button>
              </div>

              {/* Right: Structured Product Fields */}
              <div className="md:col-span-8 space-y-3.5">
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategory(cat.name);
                        if (cat.name.toLowerCase().includes('beb')) {
                          setGenderAge('Bebe');
                          setSizeGuideType('bebe');
                          setStockMatrix({ 'Bebi (0-24m)': 2 });
                        }
                      }}
                      className={`h-8 px-3 rounded-full text-xs font-medium cursor-pointer ${
                        category === cat.name
                          ? 'bg-[#121212] text-white'
                          : 'bg-[#F3F2EE] text-[#121212]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold mb-1">Naziv artikla *</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Npr. Pamučna midi haljina sa kaišem"
                      className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-sm"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold mb-1">Šifra (SKU)</label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="Auto ako je prazno"
                      className="w-full h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">
                      Nabavna (RSD)
                    </label>
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="Npr. 850"
                      className="w-full h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">
                      Akcijska (RSD) *
                    </label>
                    <input
                      type="number"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      placeholder="1690"
                      className="w-full h-10 px-2.5 bg-[#FAF9F6] border border-[#121212] rounded-xl text-sm font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">
                      Redovna {draftDiscount > 0 ? `(-${draftDiscount}%)` : ''}
                    </label>
                    <input
                      type="number"
                      value={originalPrice}
                      onChange={(e) => setOriginalPrice(e.target.value)}
                      placeholder="3490"
                      className="w-full h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">
                      Min. cena (RSD)
                    </label>
                    <input
                      type="number"
                      value={minAllowedPrice}
                      onChange={(e) => setMinAllowedPrice(e.target.value)}
                      placeholder="Zaštita marže"
                      className="w-full h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs tabular-nums"
                    />
                  </div>
                </div>

                {liveMargin !== null && (
                  <p
                    className={`text-[11px] font-semibold tabular-nums ${
                      liveMargin >= 0 ? 'text-emerald-800' : 'text-[#9F1239]'
                    }`}
                  >
                    {liveMargin >= 0
                      ? `Planirana bruto razlika po komadu: +${formatRsd(liveMargin)}`
                      : `Upozorenje: Prodajna cena je ${formatRsd(Math.abs(liveMargin))} ispod nabavne!`}
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Brend (opciono)</label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Boja</label>
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Namena / Pol</label>
                    <select
                      value={genderAge}
                      onChange={(e) => setGenderAge(e.target.value as GenderAgeGroup)}
                      className="w-full h-10 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                    >
                      <option value="Žene">Žene</option>
                      <option value="Muškarci">Muškarci</option>
                      <option value="Unisex">Unisex</option>
                      <option value="Bebe">Bebe</option>
                      <option value="Deca">Deca</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Status objave</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProductLifecycleStatus)}
                      className="w-full h-10 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs font-semibold"
                    >
                      <option value="Aktivan">Aktivan (vidljiv)</option>
                      <option value="Nacrt">Nacrt</option>
                      <option value="Skriven">Skriven</option>
                      <option value="Arhiviran">Arhiviran</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={materialNote}
                    onChange={(e) => setMaterialNote(e.target.value)}
                    placeholder="Materijal / kroj (npr. 100% pamuk)"
                    className="h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    value={warehouseLocation}
                    onChange={(e) => setWarehouseLocation(e.target.value)}
                    placeholder="Pozicija u magacinu / kutiji (opciono)"
                    className="h-10 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                  />
                </div>

                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kratak opis za kupca..."
                  className="w-full p-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
                />

                {/* Size & Stock Matrix */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">
                      Veličine i količine (Ukupno: {getTotalStock(stockMatrix)} kom)
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStockMatrix({ S: 1, M: 2, L: 1, XL: 1 })}
                        className="px-2 py-1 rounded bg-[#F3F2EE] text-[11px] font-medium cursor-pointer"
                      >
                        Preset S–XL
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockMatrix({})}
                        className="px-2 py-1 rounded bg-[#F3F2EE] text-[11px] text-[#6B6862] cursor-pointer"
                      >
                        Nula
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ALL_PRODUCT_SIZES.map((sz) => {
                      const qty = stockMatrix[sz] ?? 0;
                      return (
                        <div
                          key={sz}
                          className={`flex items-center justify-between p-2 rounded-xl border ${
                            qty > 0 ? 'bg-white border-[#121212]' : 'bg-[#FAF9F6] border-[#E6E2D8]'
                          }`}
                        >
                          <span className="text-xs font-semibold truncate">{sz}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustSize(sz, -1)}
                              className="w-6 h-6 rounded bg-[#F3F2EE] flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-bold tabular-nums">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustSize(sz, 1)}
                              className="w-6 h-6 rounded bg-[#121212] text-white flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isNewFlag}
                      onChange={(e) => setIsNewFlag(e.target.checked)}
                      className="w-4 h-4 accent-[#9F1239]"
                    />
                    <span>Oznaka NOVO u katalogu</span>
                  </label>
                  <input
                    type="text"
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Interna napomena (ne vidi kupac)"
                    className="h-9 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs flex-1 min-w-[200px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave(false)}
                    className="h-11 rounded-xl bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    {saving
                      ? 'Čuvanje...'
                      : editingId
                        ? 'Sačuvaj izmene'
                        : 'Sačuvaj i objavi'}
                  </button>
                  {!editingId && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSave(true)}
                      className="h-11 rounded-xl bg-[#121212] hover:bg-[#2A2A2A] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      Sačuvaj i dodaj sledeći
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Catalog Management List */}
      {mode === 'catalog' && (
        <section className="space-y-3">
          <div className="bg-white border border-[#E6E2D8] rounded-2xl p-3.5 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6B6862] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pretraži po nazivu, SKU šifri, brendu..."
                className="w-full h-10 pl-9 pr-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
              />
            </div>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
            >
              <option value="Sve">Sve kategorije</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'Sve' | ProductLifecycleStatus)}
              className="h-10 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl text-xs"
            >
              <option value="Sve">Svi statusi</option>
              <option value="Aktivan">Aktivan</option>
              <option value="Nacrt">Nacrt</option>
              <option value="Skriven">Skriven</option>
              <option value="Rasprodat">Rasprodat</option>
              <option value="Arhiviran">Arhiviran</option>
            </select>
          </div>

          <div className="space-y-2.5">
            {filteredProducts.map((p) => {
              const avail = getTotalStock(p.stockBySize, p.variants);
              return (
                <div
                  key={p.id}
                  className="bg-white border border-[#E6E2D8] rounded-2xl p-3.5 flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="w-16 h-20 object-cover rounded-xl bg-[#F3F2EE] shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#E6E2D8] font-semibold">
                          {p.sku || p.id}
                        </span>
                        <span className="text-[#6B6862]">{p.category}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            p.status === 'Aktivan'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {p.status || (p.active ? 'Aktivan' : 'Skriven')}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#121212] truncate">{p.title}</h3>
                      <p className="text-xs tabular-nums">
                        <strong className="text-[#9F1239]">{formatRsd(p.salePrice)}</strong>
                        {p.purchasePrice != null && (
                          <span className="text-[#6B6862] ml-2">
                            (Nabavna: {formatRsd(p.purchasePrice)})
                          </span>
                        )}
                        <span className="text-[#121212] ml-2">· Dostupno: {avail} kom</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => loadProductIntoForm(p, false)}
                      className="h-8 px-2.5 rounded-lg border border-[#D8D2C5] hover:border-[#121212] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Izmeni</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadProductIntoForm(p, true)}
                      title="Dupliraj bez stanja"
                      className="h-8 px-2.5 rounded-lg border border-[#D8D2C5] hover:border-[#121212] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Dupliraj</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextActive = !p.active;
                        await updateProductApi(p.id, {
                          active: nextActive,
                          status: nextActive ? 'Aktivan' : 'Skriven',
                        });
                        onProductsChanged();
                      }}
                      className="h-8 px-2.5 rounded-lg bg-[#FAF9F6] border border-[#E6E2D8] text-xs font-medium cursor-pointer"
                    >
                      {p.active ? 'Sakrij' : 'Aktiviraj'}
                    </button>
                    {userRole === 'vlasnik' && (
                      confirmDeleteId === p.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteProductApi(p.id);
                            setConfirmDeleteId(null);
                            onProductsChanged();
                          }}
                          className="h-8 px-2.5 rounded-lg bg-[#9F1239] text-white text-xs font-semibold cursor-pointer"
                        >
                          Potvrdi brisanje
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(p.id)}
                          aria-label={`Obriši ${p.title}`}
                          className="w-8 h-8 rounded-lg border border-[#E2DDD3] text-[#6B6862] hover:text-[#9F1239] flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
