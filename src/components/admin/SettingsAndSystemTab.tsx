import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileSpreadsheet,
  KeyRound,
  Settings,
  ShieldCheck,
  Upload,
  UserPlus,
} from 'lucide-react';
import type {
  AdminRole,
  AdminUserPublic,
  CategoryConfig,
  LegalPageRecord,
  RestockSubscription,
  ReviewItem,
  StoreSettings,
} from '../../types/store';
import {
  changeAdminPasswordApi,
  commitCsvImportApi,
  createAdminUserApi,
  createBackupApi,
  downloadAdminCsvApi,
  downloadBackupApi,
  moderateReviewApi,
  previewCsvImportApi,
  restoreBackupApi,
  updateCategoriesApi,
  updateLegalPageApi,
  updateSettingsApi,
} from '../../utils/api';
import { formatRsd } from '../../utils/storeLogic';

interface SettingsAndSystemTabProps {
  userRole: AdminRole;
  settings: StoreSettings;
  categories: CategoryConfig[];
  legalPages: LegalPageRecord[];
  reviews: ReviewItem[];
  restockSubscriptions: RestockSubscription[];
  users: AdminUserPublic[];
  backups: { fileName: string; sizeBytes: number; createdAt: string }[];
  onDataChanged: () => void;
}

export function SettingsAndSystemTab({
  userRole,
  settings,
  categories,
  legalPages,
  reviews,
  restockSubscriptions,
  users,
  backups,
  onDataChanged,
}: SettingsAndSystemTabProps) {
  const [formSettings, setFormSettings] = useState<StoreSettings>(settings);

  useEffect(() => {
    setFormSettings(settings);
  }, [settings]);

  const [selectedLegalSlug, setSelectedLegalSlug] = useState(legalPages[0]?.slug || 'o-nama');
  const activeLegal = legalPages.find((l) => l.slug === selectedLegalSlug) || legalPages[0];
  const [legalTitle, setLegalTitle] = useState(activeLegal?.title || '');
  const [legalContent, setLegalContent] = useState(activeLegal?.content || '');

  // Password change
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');

  // New user (Owner only)
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState<'zaposleni' | 'vlasnik'>('zaposleni');

  // New category
  const [newCatName, setNewCatName] = useState('');

  // CSV import
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<
    | {
        rowIndex: number;
        sku: string;
        title: string;
        category: string;
        salePrice: number;
        duplicateReason?: string;
        error?: string;
      }[]
    | null
  >(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const missingOwnerFields = [
    !formSettings.legalCompanyName.trim() && 'Poslovno ime firme / radnje',
    !formSettings.legalSeatAddress.trim() && 'Adresa sedišta',
    !formSettings.legalPib.trim() && 'PIB',
    !formSettings.legalMb.trim() && 'Matični broj (MB)',
    !formSettings.metaPixelId.trim() && 'Meta Pixel ID (opciono)',
    !formSettings.ga4MeasurementId.trim() && 'Google Analytics 4 ID (opciono)',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
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

      {/* Owner Pre-Launch Checklist */}
      {missingOwnerFields.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Stavke koje čekaju unos vlasnika pre javnog pokretanja:</span>
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {missingOwnerFields.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Reviews Moderation & Restock Requests (Accessible to all staff) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-2.5 text-xs">
          <h3 className="font-editorial text-base font-semibold">
            Moderacija recenzija ({reviews.length})
          </h3>
          <div className="max-h-60 overflow-y-auto divide-y divide-[#F0ECE3]">
            {reviews.slice(0, 20).map((r) => (
              <div key={r.id} className="py-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {r.name} · {r.rating || 5}★{' '}
                    <span className="text-[10px] text-[#6B6862]">
                      ({r.status || 'approved'})
                    </span>
                  </p>
                  <p className="text-[#6B6862] mt-0.5">“{r.comment}”</p>
                </div>
                <select
                  value={r.status || 'approved'}
                  onChange={async (e) => {
                    await moderateReviewApi(
                      r.id,
                      e.target.value as 'approved' | 'pending' | 'hidden',
                    );
                    onDataChanged();
                  }}
                  className="h-8 px-2 rounded-lg border border-[#D8D2C5] text-[11px]"
                >
                  <option value="approved">Objavljena</option>
                  <option value="pending">Na čekanju</option>
                  <option value="hidden">Skrivena</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-2.5 text-xs">
          <h3 className="font-editorial text-base font-semibold">
            Zahtevi „Obavesti me kad stigne“ ({restockSubscriptions.length})
          </h3>
          {restockSubscriptions.length === 0 ? (
            <p className="text-[#6B6862]">Još nema zahteva kupaca za dopunu veličina.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y divide-[#F0ECE3]">
              {restockSubscriptions.map((sub) => (
                <div key={sub.id} className="py-2 flex justify-between gap-2">
                  <div>
                    <p className="font-semibold">{sub.productTitle}</p>
                    <p className="text-[#6B6862]">
                      Veličina: {sub.size} · Kontakt: <strong>{sub.contact}</strong>
                    </p>
                  </div>
                  <span className="text-[10px] text-[#6B6862] shrink-0">
                    {new Date(sub.createdAt).toLocaleDateString('sr-RS')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CSV Import / Export */}
      <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-4 text-xs">
        <h3 className="font-editorial text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#9F1239]" />
          <span>Izvoz izveštaja i CSV uvoz artikala</span>
        </h3>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['products', 'Izvezi artikle'],
              ['orders', 'Izvezi porudžbine'],
              ['courier', 'Izvezi Post Express'],
              ['customers', 'Izvezi kupce'],
              ['finances', 'Izvezi finansije'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => void downloadAdminCsvApi(type)}
              className="h-9 px-3 rounded-xl border border-[#D8D2C5] hover:border-[#121212] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-[#F0ECE3] space-y-2">
          <p className="font-semibold">Uvoz artikala iz CSV fajla (sa pregledom duplikata)</p>
          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="SKU,Naziv,Kategorija,Akcijska cena,Redovna cena,Nabavna cena,Velicine&#10;AO-901,Pamučni duks krem,Majice i duksevi,1890,3490,900,S:2|M:3"
            className="w-full p-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-xl font-mono text-[11px]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!csvText.trim()) return;
                const res = await previewCsvImportApi(csvText);
                setCsvPreview(res.preview);
              }}
              className="h-9 px-3.5 rounded-xl bg-[#121212] text-white font-semibold cursor-pointer"
            >
              Pregledaj CSV redove
            </button>
            {csvPreview && csvPreview.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const res = await commitCsvImportApi(csvText, true);
                  setCsvPreview(null);
                  setCsvText('');
                  setFeedback({
                    type: 'success',
                    message: `Uvezeno ${res.importedCount} novih artikala.`,
                  });
                  onDataChanged();
                }}
                className="h-9 px-3.5 rounded-xl bg-[#9F1239] text-white font-semibold cursor-pointer"
              >
                Potvrdi uvoz (preskoči duplikate)
              </button>
            )}
          </div>

          {csvPreview && (
            <div className="max-h-40 overflow-y-auto divide-y divide-[#F0ECE3] border rounded-xl p-2 bg-[#FAF9F6]">
              {csvPreview.map((r) => (
                <div key={r.rowIndex} className="py-1 flex justify-between">
                  <span>
                    #{r.rowIndex} · {r.sku} · <strong>{r.title}</strong>
                  </span>
                  <span className={r.error || r.duplicateReason ? 'text-[#9F1239]' : 'text-emerald-800'}>
                    {r.error || r.duplicateReason || `${formatRsd(r.salePrice)} OK`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Owner-only Settings, Legal Pages, Users & Backups */}
      {userRole === 'vlasnik' && (
        <>
          <section className="bg-white border border-[#E6E2D8] rounded-2xl p-4 sm:p-5 space-y-4 text-xs">
            <h3 className="font-editorial text-lg font-semibold flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#9F1239]" />
              <span>Podešavanja prodavnice, dostave, firme i analitike</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="setting-brandName" className="block font-semibold mb-1">
                  Naziv prodavnice / brenda
                </label>
                <input
                  id="setting-brandName"
                  type="text"
                  value={formSettings.brandName}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, brandName: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="setting-brandSubtitle" className="block font-semibold mb-1">
                  Glavni slogan
                </label>
                <input
                  id="setting-brandSubtitle"
                  type="text"
                  value={formSettings.brandSubtitle}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, brandSubtitle: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="setting-secondarySlogan" className="block font-semibold mb-1">
                  Dodatni slogan
                </label>
                <input
                  id="setting-secondarySlogan"
                  type="text"
                  value={formSettings.secondarySlogan || ''}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, secondarySlogan: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="setting-logoMonogram" className="block font-semibold mb-1">
                  Logo monogram (npr. MP)
                </label>
                <input
                  id="setting-logoMonogram"
                  type="text"
                  maxLength={4}
                  value={formSettings.logoMonogram || 'MP'}
                  onChange={(e) =>
                    setFormSettings((s) => ({
                      ...s,
                      logoMonogram: e.target.value.toUpperCase(),
                    }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg uppercase font-semibold"
                />
              </div>
              <div>
                <label htmlFor="setting-heroTitle" className="block font-semibold mb-1">
                  Promotivni naslov (Hero)
                </label>
                <input
                  id="setting-heroTitle"
                  type="text"
                  value={formSettings.heroTitle}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, heroTitle: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="setting-contactPhone" className="block font-semibold mb-1">
                  Kontakt telefon (prikaz)
                </label>
                <input
                  id="setting-contactPhone"
                  type="text"
                  value={formSettings.contactPhoneDisplay}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, contactPhoneDisplay: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="setting-contactViber" className="block font-semibold mb-1">
                  Viber broj (+381...)
                </label>
                <input
                  id="setting-contactViber"
                  type="text"
                  value={formSettings.contactViberNumber}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, contactViberNumber: e.target.value }))
                  }
                  placeholder="+381692305074"
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="setting-contactEmail" className="block font-semibold mb-1">
                  Kontakt e-pošta
                </label>
                <input
                  id="setting-contactEmail"
                  type="email"
                  value={formSettings.contactEmail}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, contactEmail: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label htmlFor="setting-announcementText" className="block font-semibold mb-1">
                  Promotivna traka na vrhu sajta
                </label>
                <input
                  id="setting-announcementText"
                  type="text"
                  value={formSettings.announcementText}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, announcementText: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label htmlFor="setting-heroSubtitle" className="block font-semibold mb-1">
                  Promotivni opis (Hero podnaslov)
                </label>
                <input
                  id="setting-heroSubtitle"
                  type="text"
                  value={formSettings.heroSubtitle}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, heroSubtitle: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Cena dostave (RSD)</label>
                <input
                  type="number"
                  value={formSettings.shippingCostRsd}
                  onChange={(e) =>
                    setFormSettings((s) => ({
                      ...s,
                      shippingCostRsd: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Besplatna dostava preko (RSD)</label>
                <input
                  type="number"
                  value={formSettings.freeShippingThresholdRsd}
                  onChange={(e) =>
                    setFormSettings((s) => ({
                      ...s,
                      freeShippingThresholdRsd: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Pakovanje kao poklon (RSD)</label>
                <input
                  type="number"
                  value={formSettings.giftWrapCostRsd}
                  onChange={(e) =>
                    setFormSettings((s) => ({
                      ...s,
                      giftWrapCostRsd: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Pravno lice / Radnja</label>
                <input
                  type="text"
                  value={formSettings.legalCompanyName}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, legalCompanyName: e.target.value }))
                  }
                  placeholder="Npr. Moda Plus PR"
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">PIB</label>
                <input
                  type="text"
                  value={formSettings.legalPib}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, legalPib: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Matični broj (MB)</label>
                <input
                  type="text"
                  value={formSettings.legalMb}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, legalMb: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Meta Pixel ID (opciono)</label>
                <input
                  type="text"
                  value={formSettings.metaPixelId}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, metaPixelId: e.target.value }))
                  }
                  placeholder="Broj piksela"
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">GA4 Measurement ID</label>
                <input
                  type="text"
                  value={formSettings.ga4MeasurementId}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, ga4MeasurementId: e.target.value }))
                  }
                  placeholder="G-XXXXXXXXXX"
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Adresa za lično preuzimanje</label>
                <input
                  type="text"
                  value={formSettings.pickupAddress}
                  onChange={(e) =>
                    setFormSettings((s) => ({ ...s, pickupAddress: e.target.value }))
                  }
                  className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.showSoldOutProducts}
                  onChange={(e) =>
                    setFormSettings((s) => ({
                      ...s,
                      showSoldOutProducts: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#9F1239]"
                />
                <span>Prikazuj rasprodate artikle u katalogu</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.holidayBannerActive}
                  onChange={(e) =>
                    setFormSettings((s) => ({
                      ...s,
                      holidayBannerActive: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#9F1239]"
                />
                <span>Praznično / vanredno obaveštenje u vrhu</span>
              </label>
            </div>

            {formSettings.holidayBannerActive && (
              <input
                type="text"
                value={formSettings.holidayBannerText}
                onChange={(e) =>
                  setFormSettings((s) => ({ ...s, holidayBannerText: e.target.value }))
                }
                placeholder="Tekst obaveštenja za kupce (npr. Slanje pošiljki od ponedeljka)..."
                className="w-full h-9 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
            )}

            <button
              type="button"
              onClick={async () => {
                await updateSettingsApi(formSettings);
                setFeedback({ type: 'success', message: 'Podešavanja prodavnice sačuvana.' });
                onDataChanged();
              }}
              className="h-10 px-5 rounded-xl bg-[#9F1239] text-white font-semibold cursor-pointer"
            >
              Sačuvaj podešavanja prodavnice
            </button>
          </section>

          {/* Categories & Legal Pages */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3">
              <h3 className="font-editorial text-base font-semibold">Kategorije kataloga</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Nova kategorija..."
                  className="flex-1 h-9 px-3 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newCatName.trim()) return;
                    await updateCategoriesApi([
                      ...categories,
                      { name: newCatName.trim(), visible: true, sortOrder: categories.length + 1 },
                    ]);
                    setNewCatName('');
                    onDataChanged();
                  }}
                  className="h-9 px-3 rounded-lg bg-[#121212] text-white font-semibold cursor-pointer"
                >
                  Dodaj
                </button>
              </div>
              <div className="space-y-1.5">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#FAF9F6] border border-[#E6E2D8]"
                  >
                    <span className="font-medium">{c.name}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await updateCategoriesApi(
                          categories.map((x) =>
                            x.id === c.id ? { ...x, visible: !x.visible } : x,
                          ),
                        );
                        onDataChanged();
                      }}
                      className="text-[11px] font-semibold text-[#9F1239] cursor-pointer"
                    >
                      {c.visible ? 'Vidljiva' : 'Skrivena'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-2.5">
              <h3 className="font-editorial text-base font-semibold">
                Uređivanje pravnih i info stranica
              </h3>
              <select
                value={selectedLegalSlug}
                onChange={(e) => {
                  const nextSlug = e.target.value as LegalPageRecord['slug'];
                  setSelectedLegalSlug(nextSlug);
                  const found = legalPages.find((p) => p.slug === nextSlug);
                  if (found) {
                    setLegalTitle(found.title);
                    setLegalContent(found.content);
                  }
                }}
                className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              >
                {legalPages.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title} (/{p.slug})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={legalTitle}
                onChange={(e) => setLegalTitle(e.target.value)}
                className="w-full h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
              <textarea
                rows={4}
                value={legalContent}
                onChange={(e) => setLegalContent(e.target.value)}
                className="w-full p-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
              />
              <button
                type="button"
                onClick={async () => {
                  await updateLegalPageApi(selectedLegalSlug, legalTitle, legalContent);
                  setFeedback({ type: 'success', message: 'Stranica je ažurirana.' });
                  onDataChanged();
                }}
                className="h-9 px-4 rounded-xl bg-[#121212] text-white font-semibold cursor-pointer"
              >
                Sačuvaj stranicu
              </button>
            </div>
          </section>

          {/* Users & Password & Backups */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3">
              <h3 className="font-editorial text-base font-semibold flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-[#9F1239]" />
                <span>Nalozi osoblja i lozinka</span>
              </h3>

              <div className="space-y-1">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex justify-between p-2 rounded-lg bg-[#FAF9F6] border border-[#E6E2D8]"
                  >
                    <span>
                      <strong>{u.displayName}</strong> (@{u.username})
                    </span>
                    <span className="uppercase font-semibold text-[#9F1239]">{u.role}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F0ECE3]">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Korisničko ime"
                  className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Ime prikaza"
                  className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
                <input
                  type="password"
                  value={newUserPass}
                  onChange={(e) => setNewUserPass(e.target.value)}
                  placeholder="Lozinka (min 4)"
                  className="h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                />
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'zaposleni' | 'vlasnik')}
                  className="h-9 px-2 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                >
                  <option value="zaposleni">Zaposleni (operativa)</option>
                  <option value="vlasnik">Vlasnik (pun pristup)</option>
                </select>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!newUsername.trim() || newUserPass.length < 4) return;
                  await createAdminUserApi({
                    username: newUsername,
                    displayName: newDisplayName || newUsername,
                    password: newUserPass,
                    role: newUserRole,
                  });
                  setNewUsername('');
                  setNewDisplayName('');
                  setNewUserPass('');
                  setFeedback({ type: 'success', message: 'Novi korisnički nalog kreiran.' });
                  onDataChanged();
                }}
                className="h-9 px-4 rounded-xl bg-[#121212] text-white font-semibold cursor-pointer"
              >
                Kreiraj nalog
              </button>

              <div className="pt-3 border-t border-[#F0ECE3] space-y-2">
                <p className="font-semibold flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" /> Promena moje lozinke
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={currPass}
                    onChange={(e) => setCurrPass(e.target.value)}
                    placeholder="Trenutna"
                    className="flex-1 h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                  />
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Nova (min 4)"
                    className="flex-1 h-9 px-2.5 bg-[#FAF9F6] border border-[#D8D2C5] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await changeAdminPasswordApi(currPass, newPass);
                        setCurrPass('');
                        setNewPass('');
                        setFeedback({ type: 'success', message: 'Lozinka uspešno promenjena.' });
                      } catch (err) {
                        setFeedback({
                          type: 'error',
                          message: err instanceof Error ? err.message : 'Greška.',
                        });
                      }
                    }}
                    className="h-9 px-3 rounded-lg bg-[#9F1239] text-white font-semibold cursor-pointer"
                  >
                    Promeni
                  </button>
                </div>
              </div>
            </div>

            {/* JSON Backups & Restore */}
            <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-3">
              <h3 className="font-editorial text-base font-semibold flex items-center gap-1.5">
                <Database className="w-4 h-4 text-[#C5A059]" />
                <span>Rezervne kopije (Backup &amp; Restore)</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await createBackupApi();
                    setFeedback({ type: 'success', message: 'Novi rezervni snimak baze kreiran.' });
                    onDataChanged();
                  }}
                  className="h-9 px-3.5 rounded-xl bg-[#121212] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Napravi snimak sada</span>
                </button>
                <button
                  type="button"
                  onClick={() => void downloadBackupApi()}
                  className="h-9 px-3.5 rounded-xl border border-[#D8D2C5] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Preuzmi ceo JSON</span>
                </button>
                <label className="h-9 px-3.5 rounded-xl border border-[#D8D2C5] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Vrati iz JSON fajla</span>
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const txt = await file.text();
                      const parsed = JSON.parse(txt);
                      await restoreBackupApi({ snapshot: parsed });
                      setFeedback({ type: 'success', message: 'Baza uspešno vraćena iz JSON fajla.' });
                      onDataChanged();
                    }}
                  />
                </label>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-[#F0ECE3] pt-2">
                {backups.map((b) => (
                  <div key={b.fileName} className="py-2 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px]">{b.fileName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void downloadBackupApi(b.fileName)}
                        className="px-2 py-1 rounded border border-[#D8D2C5] text-[10px] font-semibold cursor-pointer"
                      >
                        Preuzmi
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await restoreBackupApi({ fileName: b.fileName });
                          setFeedback({ type: 'success', message: `Vraćen snimak ${b.fileName}.` });
                          onDataChanged();
                        }}
                        className="px-2 py-1 rounded bg-[#9F1239] text-white text-[10px] font-semibold cursor-pointer"
                      >
                        Vrati
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
