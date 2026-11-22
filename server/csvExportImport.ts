import type {
  AdminProduct,
  CustomerRecord,
  ExpenseRecord,
  Order,
  ProductSize,
} from '../src/types/store';
import { computeFinancialSummary } from '../src/utils/financeLogic';
import { generateProductSlug, getTotalStock, normalizeSerbianLatin } from '../src/utils/storeLogic';
import { syncProductStockFields } from './db';

const UTF8_BOM = '\uFEFF';

function csvCell(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (/[",\r\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
  ];
  return UTF8_BOM + lines.join('\r\n');
}

export function exportProductsCsv(products: AdminProduct[]): string {
  const headers = [
    'ID',
    'SKU',
    'Naziv',
    'Kategorija',
    'Brend',
    'Boja',
    'Status',
    'Nabavna cena (RSD)',
    'Stara cena (RSD)',
    'Akcijska cena (RSD)',
    'Ukupno na stanju',
    'Veličine i stanje',
    'Prodatih komada',
  ];
  const rows = products.map((p) => [
    p.id,
    p.sku || '',
    p.title,
    p.category,
    p.brand || '',
    p.color || '',
    p.status || (p.active ? 'Aktivan' : 'Skriven'),
    p.purchasePrice ?? '',
    p.originalPrice,
    p.salePrice,
    getTotalStock(p.stockBySize, p.variants),
    Object.entries(p.stockBySize)
      .map(([sz, qty]) => `${sz}:${qty ?? 0}`)
      .join(' | '),
    p.soldCount ?? 0,
  ]);
  return toCsv(headers, rows);
}

export function exportOrdersCsv(orders: Order[]): string {
  const headers = [
    'Šifra porudžbine',
    'Datum',
    'Izvor',
    'Status',
    'Kupac',
    'Telefon',
    'Adresa',
    'Grad i poštanski broj',
    'Artikli',
    'Ukupno komada',
    'Poštarina (RSD)',
    'Ukupno za naplatu (RSD)',
    'Broj za praćenje',
    'Otkup rasknjižen',
  ];
  const rows = orders.map((o) => [
    o.id,
    o.createdAt,
    o.source || 'Internet prodavnica',
    o.status,
    o.customer.fullName,
    o.customer.phone,
    o.customer.street,
    o.customer.cityZip,
    (o.items ?? [])
      .map((i) => `${i.title} (${i.size}) x${i.quantity}`)
      .join(' | ') || `${o.productTitle} (${o.selectedSize})`,
    o.bundleQuantity,
    o.pricing.shippingCost,
    o.pricing.total,
    o.shipping?.trackingNumber || '',
    o.cod?.settledToSeller ? 'Da' : 'Ne',
  ]);
  return toCsv(headers, rows);
}

export function exportCourierPostExpressCsv(orders: Order[]): string {
  const readyStatuses = new Set(['Nova', 'Potvrđena', 'U obradi', 'Spakovana']);
  const eligible = orders.filter((o) => readyStatuses.has(o.status) && !o.pickupInPerson);
  const headers = [
    'Šifra paketa',
    'Primalac',
    'Ulica i broj',
    'Grad i poštanski broj',
    'Telefon',
    'Otkupnina (RSD)',
    'Sadržaj paketa',
    'Napomena za kurira',
  ];
  const rows = eligible.map((o) => [
    o.id,
    o.customer.fullName,
    o.customer.street,
    o.customer.cityZip,
    o.customer.phone,
    o.pricing.total,
    (o.items ?? [])
      .map((i) => `${i.title} (${i.size}) x${i.quantity}`)
      .join(', '),
    o.customer.note || '',
  ]);
  return toCsv(headers, rows);
}

export function exportCustomersCsv(customers: CustomerRecord[]): string {
  const headers = [
    'ID',
    'Ime i prezime',
    'Telefon',
    'Adresa',
    'Grad i poštanski broj',
    'Ukupno porudžbina',
    'Isporučeno',
    'Nepreuzeto',
    'Vraćeno',
    'Ukupno potrošeno (RSD)',
  ];
  const rows = customers.map((c) => [
    c.id,
    c.fullName,
    c.phone,
    c.street,
    c.cityZip,
    c.ordersCount,
    c.deliveredCount,
    c.uncollectedCount,
    c.returnedCount,
    c.totalSpentRsd,
  ]);
  return toCsv(headers, rows);
}

export function exportFinancesCsv(
  orders: Order[],
  products: AdminProduct[],
  expenses: ExpenseRecord[],
): string {
  const summary = computeFinancialSummary(orders, products, expenses);
  const headers = ['Stavka', 'Iznos / Vrednost'];
  const rows: unknown[][] = [
    ['Realizovana prodaja (Isporučeno)', summary.realizedDeliveredRevenueRsd],
    ['Aktivne porudžbine u obradi/dostavi', summary.pipelineActiveRevenueRsd],
    ['Otkazane i vraćene porudžbine (bruto)', summary.canceledAndReturnedGrossRsd],
    ['Povraćaji kupcima (RSD)', summary.refundsTotalRsd],
    ['Realizovana nabavna cena (COGS)', summary.realizedCogsRsd],
    ['Komada bez unete nabavne cene', summary.itemsMissingPurchasePriceCount],
    ['Bruto marža (RSD)', summary.grossMarginRsd],
    ['Bruto marža (%)', summary.grossMarginPercent ?? 'N/A'],
    ['Naplaćena dostava od kupaca (RSD)', summary.shippingChargedToCustomersRsd],
    ['Stvarni trošak slanja (RSD)', summary.actualShippingCostsRsd],
    ['Trošak povratnih pošiljki (RSD)', summary.returnShippingCostsRsd],
    ['Kurirske provizije (RSD)', summary.courierFeesRsd],
    ['Ostali operativni troškovi (RSD)', summary.operatingExpensesRsd],
    ['Neto dobit posle direktnih troškova (RSD)', summary.netProfitAfterDirectCostsRsd],
    ['Novac kod kurira (čeka uplatu)', summary.codAwaitingSettlementRsd],
    ['Rasknjižen otkup (primljeno na račun)', summary.codSettledReceivedRsd],
  ];
  return toCsv(headers, rows);
}

export function parseCsvText(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

export interface CsvImportPreviewRow {
  rowIndex: number;
  sku: string;
  title: string;
  category: string;
  brand?: string;
  color?: string;
  purchasePrice?: number | null;
  originalPrice: number;
  salePrice: number;
  stockBySize: Partial<Record<ProductSize, number>>;
  materialNote: string;
  description: string;
  imageUrl: string;
  duplicateReason?: string;
  error?: string;
}

export function previewProductCsvImport(
  csvText: string,
  existingProducts: AdminProduct[],
): CsvImportPreviewRow[] {
  const rows = parseCsvText(csvText);
  if (rows.length < 2) return [];

  const headerNorms = rows[0].map((h) => normalizeSerbianLatin(h));
  const findCol = (aliases: string[]) =>
    headerNorms.findIndex((h) => aliases.some((a) => h.includes(a)));

  const idxTitle = findCol(['naziv', 'title', 'artikal']);
  const idxSku = findCol(['sku', 'sifra']);
  const idxCat = findCol(['kategorij', 'category']);
  const idxBrand = findCol(['brend', 'brand']);
  const idxColor = findCol(['boja', 'color']);
  const idxPurchase = findCol(['nabavn', 'purchase', 'cogs']);
  const idxOrig = findCol(['stara', 'redovn', 'original']);
  const idxSale = findCol(['akcijsk', 'prodajn', 'sale', 'cena']);
  const idxSize = findCol(['velicin', 'size']);
  const idxQty = findCol(['kolicin', 'stanje', 'qty', 'stock']);
  const idxMat = findCol(['materijal', 'material']);
  const idxDesc = findCol(['opis', 'description']);
  const idxImg = findCol(['slik', 'image']);

  const existingSkus = new Set(
    existingProducts.map((p) => (p.sku || '').toLowerCase()).filter(Boolean),
  );
  const existingTitles = new Set(
    existingProducts.map((p) => normalizeSerbianLatin(p.title)),
  );

  const preview: CsvImportPreviewRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');

    const title = get(idxTitle);
    const sku = get(idxSku) || `IMP-${Date.now().toString(36).toUpperCase()}-${r}`;
    const salePrice = Number(get(idxSale).replace(/[^\d.]/g, '')) || 0;
    const origRaw = Number(get(idxOrig).replace(/[^\d.]/g, '')) || 0;
    const originalPrice = origRaw > salePrice ? origRaw : Math.round(salePrice * 1.8);
    const purchaseRaw = get(idxPurchase).replace(/[^\d.]/g, '');
    const purchasePrice = purchaseRaw ? Number(purchaseRaw) : null;
    const size = (get(idxSize) || 'Univerzalna') as ProductSize;
    const qty = Math.max(0, Math.floor(Number(get(idxQty)) || 1));

    let error: string | undefined;
    if (!title || title.length < 2) error = 'Nedostaje naziv artikla.';
    else if (salePrice <= 0) error = 'Neispravna prodajna cena.';

    let duplicateReason: string | undefined;
    if (existingSkus.has(sku.toLowerCase())) {
      duplicateReason = `Duplikat SKU (${sku})`;
    } else if (title && existingTitles.has(normalizeSerbianLatin(title))) {
      duplicateReason = 'Postoji artikal sa istim nazivom';
    }

    preview.push({
      rowIndex: r + 1,
      sku,
      title,
      category: get(idxCat) || 'Ostalo',
      brand: get(idxBrand) || undefined,
      color: get(idxColor) || 'Osnovna',
      purchasePrice: purchasePrice !== null && Number.isFinite(purchasePrice) ? purchasePrice : null,
      originalPrice: Math.round(originalPrice),
      salePrice: Math.round(salePrice),
      stockBySize: { [size]: qty },
      materialNote: get(idxMat) || 'Novo sa etiketom',
      description: get(idxDesc) || 'Artikal iz outlet ponude sa originalnom etiketom.',
      imageUrl: get(idxImg) || '/src/assets/images/dress_black_midi_1795368188456.jpg',
      duplicateReason,
      error,
    });
  }

  return preview;
}

export function buildImportedProduct(row: CsvImportPreviewRow): AdminProduct {
  const id = `ao-${Date.now().toString(36)}-${row.rowIndex}`;
  return syncProductStockFields({
    id,
    sku: row.sku,
    slug: generateProductSlug(row.title, id),
    brand: row.brand,
    color: row.color,
    title: row.title,
    category: row.category,
    description: row.description,
    materialNote: row.materialNote,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    originalPrice: row.originalPrice,
    imageUrl: row.imageUrl,
    stockBySize: row.stockBySize,
    isNew: true,
    active: true,
    status: 'Aktivan',
    createdAt: new Date().toISOString(),
  });
}
