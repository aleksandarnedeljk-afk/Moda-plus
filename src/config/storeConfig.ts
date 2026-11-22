import type {
  CategoryFilter,
  LegalPageRecord,
  ProductCategory,
  ProductSize,
  SizeFilter,
  SortOption,
  StoreSettings,
} from '../types/store';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  brandName: 'MODA PLUS OUTLET',
  brandSubtitle: 'Odličan stil. Još bolje cene.',
  secondarySlogan: 'Moda za celu porodicu po outlet cenama.',
  logoMonogram: 'MP',
  announcementText:
    '✨ MODA PLUS OUTLET — Velika rasprodaja zaliha • Odličan stil. Još bolje cene. • Plaćanje pouzećem • Besplatna dostava preko 4.000 RSD',
  holidayBannerText: '',
  holidayBannerActive: false,
  heroTitle: 'Velika rasprodaja zaliha',
  heroSubtitle:
    'Odličan stil. Još bolje cene. Moda za celu porodicu po outlet cenama — potpuno novi komadi sa originalnom etiketom u ograničenim veličinama, plaćanje pouzećem i brza Post Express dostava.',
  heroImageUrl: '/src/assets/images/hero_atelier_editorial_1795368188888.jpg',
  contactPhoneDisplay: '069 230 5074',
  contactViberNumber: '+381692305074',
  contactEmail: 'podrska@modaplusoutlet.rs',
  instagramHandle: '',
  facebookPageUrl: '',
  dispatchHours: 'Pon–Pet 09:00–17:00 • Sub 09:00–14:00',
  shippingCostRsd: 450,
  freeShippingThresholdRsd: 4000,
  bundle2DiscountPercent: 15,
  bundle3DiscountPercent: 20,
  giftWrapCostRsd: 250,
  enablePickupInPerson: true,
  pickupAddress: '',
  showSoldOutProducts: true,
  autoLockMinutes: 30,
  legalCompanyName: '',
  legalSeatAddress: '',
  legalPib: '',
  legalMb: '',
  legalBankAccount: '',
  metaPixelId: '',
  ga4MeasurementId: '',
  gscVerificationTag: '',
};

export const STORE_CONFIG = {
  brandName: DEFAULT_STORE_SETTINGS.brandName,
  brandSubtitle: DEFAULT_STORE_SETTINGS.brandSubtitle,
  secondarySlogan: DEFAULT_STORE_SETTINGS.secondarySlogan,
  logoMonogram: DEFAULT_STORE_SETTINGS.logoMonogram,
  announcementText: DEFAULT_STORE_SETTINGS.announcementText,
  shippingCostRsd: DEFAULT_STORE_SETTINGS.shippingCostRsd,
  freeShippingThresholdRsd: DEFAULT_STORE_SETTINGS.freeShippingThresholdRsd,
  itemsPerBatch: 12,
  contactPhoneDisplay: DEFAULT_STORE_SETTINGS.contactPhoneDisplay,
  contactPhoneHref: 'tel:+381692305074',
  contactViberNumber: DEFAULT_STORE_SETTINGS.contactViberNumber,
  contactEmail: DEFAULT_STORE_SETTINGS.contactEmail,
  dispatchHours: DEFAULT_STORE_SETTINGS.dispatchHours,
  heroImageUrl: DEFAULT_STORE_SETTINGS.heroImageUrl,
} as const;

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Ženske haljine',
  'Majice i duksevi',
  'Pantalone i farmerke',
  'Za bebe (odelca i čarapice)',
  'Ostalo',
];

export const CATEGORY_FILTERS: CategoryFilter[] = ['Sve', ...PRODUCT_CATEGORIES];

export const ALL_PRODUCT_SIZES: ProductSize[] = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'Bebi (0-24m)',
  'Univerzalna',
];

export const SIZE_FILTERS: SizeFilter[] = ['Sve veličine', ...ALL_PRODUCT_SIZES];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Najnovije dodato' },
  { value: 'bestselling', label: 'Najprodavanije' },
  { value: 'price-asc', label: 'Cena: niža ka višoj' },
  { value: 'price-desc', label: 'Cena: viša ka višoj' },
  { value: 'discount-desc', label: 'Najveći popust' },
];

export const ADULT_SIZE_GUIDE_ROWS = [
  { size: 'XS', chest: '80–84 cm', waist: '62–66 cm', hips: '86–90 cm', eu: '34' },
  { size: 'S', chest: '84–88 cm', waist: '66–70 cm', hips: '90–94 cm', eu: '36' },
  { size: 'M', chest: '88–94 cm', waist: '70–76 cm', hips: '94–100 cm', eu: '38' },
  { size: 'L', chest: '94–100 cm', waist: '76–82 cm', hips: '100–106 cm', eu: '40' },
  { size: 'XL', chest: '100–108 cm', waist: '82–90 cm', hips: '106–114 cm', eu: '42–44' },
  { size: 'XXL', chest: '108–116 cm', waist: '90–98 cm', hips: '114–122 cm', eu: '46' },
];

export const BABY_SIZE_GUIDE_ROWS = [
  { age: '0–3 meseca', height: '56–62 cm', weight: '3,5–6 kg' },
  { age: '3–6 meseci', height: '62–68 cm', weight: '6–8 kg' },
  { age: '6–12 meseci', height: '68–80 cm', weight: '8–10,5 kg' },
  { age: '12–24 meseca', height: '80–92 cm', weight: '10,5–13,5 kg' },
];

export const DEFAULT_LEGAL_PAGES: LegalPageRecord[] = [
  {
    slug: 'o-nama',
    title: 'O nama',
    content:
      'MODA PLUS OUTLET — Odličan stil. Još bolje cene. Moda za celu porodicu po outlet cenama. Specijalizovani smo za veliku rasprodaju novih butik zaliha u Srbiji. Svi artikli su potpuno novi, sa originalnom etiketom, pažljivo pregledani pre pakovanja i dostupni u ograničenim količinama do isteka zaliha.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'kontakt',
    title: 'Kontakt i podrška kupcima',
    content:
      'Za sve informacije o veličinama, dostupnosti i poručivanju pozovite nas na 069 230 5074 ili nam pišite direktno na Viber (+381692305074) ili mejlom u okviru radnog vremena podrške.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'uslovi-kupovine',
    title: 'Uslovi kupovine',
    content:
      'Poručivanje se vrši bez registracije putem sajta ili direktnog kontakta. Cene su iskazane u dinarima (RSD). Porudžbina je obavezujuća nakon potvrde i provere raspoloživosti na stanju. Trgovac zadržava pravo otkaza porudžbine u slučaju očigledne greške u ceni ili trenutnog nestanka artikla sa zaliha.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'politika-privatnosti',
    title: 'Politika privatnosti',
    content:
      'Podatke koje ostavljate pri poručivanju (ime i prezime, adresa, grad, poštanski broj i broj telefona) koristimo isključivo radi pripreme paketa, slanja putem kurirske službe i komunikacije u vezi sa vašom porudžbinom. Podaci se ne prodaju trećim licima. Marketinški kolačići i pikseli učitavaju se samo uz vašu izričitu saglasnost.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'dostava-i-placanje',
    title: 'Dostava i plaćanje',
    content:
      'Plaćanje se vrši isključivo pouzećem kuriru prilikom preuzimanja pošiljke u gotovini. Isporuku vrši Post Express u roku od 24 do 48 sati radnim danima na teritoriji Republike Srbije. Cena dostave iznosi 450 RSD, dok je za porudžbine od 4.000 RSD i više ili paket od 3 komada dostava besplatna.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'reklamacije',
    title: 'Reklamacije i zamena',
    content:
      'Ukoliko artikal ima fabrički nedostatak ili je došlo do greške pri pakovanju, kupac ima pravo na reklamaciju u skladu sa Zakonom o zaštiti potrošača Republike Srbije. Pošaljite nam fotografiju i broj porudžbine putem Vibera ili e-pošte i rešićemo zamenu ili povraćaj sredstava u najkraćem roku.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'povracaj-robe',
    title: 'Povraćaj robe i zamena veličine',
    content:
      'Zamena veličine ili povraćaj nekorišćene robe sa originalnom etiketom mogući su u roku od 14 dana od dana prijema pošiljke. Artikal ne sme biti nošen, pran niti oštećen. Troškove povraćaja pri zameni veličine snosi kupac, osim u slučaju greške prodavca.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
  {
    slug: 'odustanak-od-kupovine',
    title: 'Pravo na odustanak od kupovine',
    content:
      'Kupac koji kupuje na daljinu ima pravo da odustane od ugovora u roku od 14 dana od dana kada je roba dospela u državinu kupca, bez navođenja razloga. Izjava o odustanku može se poslati elektronskim putem na e-mail adresu podrške sa brojem porudžbine.',
    updatedAt: '2026-11-22T00:00:00.000Z',
  },
];
