import { GoogleGenAI, Type } from '@google/genai';
import { PRODUCT_CATEGORIES } from '../src/config/storeConfig';

export interface ProductAiSuggestion {
  title: string;
  category: string;
  color: string;
  shortDescription: string;
}

export async function suggestProductFieldsFromImage(params: {
  imageDataUrl?: string;
  sellerNotes?: string;
  categories?: string[];
}): Promise<ProductAiSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'AI pomoćnik nije podešen (GEMINI_API_KEY nije dodat u Settings > Secrets). Unesite polja ručno.',
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const allowedCats =
    params.categories && params.categories.length > 0 ? params.categories : PRODUCT_CATEGORIES;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.imageDataUrl && params.imageDataUrl.startsWith('data:image/')) {
    const match = params.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }
  }

  parts.push({
    text: [
      'Ti si asistent za brzi unos artikala u srpskoj modnoj outlet prodavnici (srpski jezik, latinica).',
      `Na osnovu fotografije i eventualne beleške prodavca, predloži SAMO:`,
      `1. title: jasan prodajni naziv artikla (bez izmišljanja brenda ili sastava).`,
      `2. category: izaberi tačno jednu od: ${allowedCats.join(', ')}.`,
      `3. color: dominantna boja na srpskom (npr. Crna, Bordo, Krem, Bež, Maslinasta, Indigo).`,
      `4. shortDescription: kratak, tačan opis izgleda i kroja na srpskom (1-2 rečenice).`,
      'STROGO PRAVILO: NIKADA ne izmišljaj brend, procenat/sastav materijala (npr. viskoza/pamuk/kašmir) niti zemlju porekla ako nisu eksplicitno napisani u belešci prodavca.',
      params.sellerNotes ? `Beleška prodavca: ${params.sellerNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { type: Type.STRING },
          color: { type: Type.STRING },
          shortDescription: { type: Type.STRING },
        },
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as Partial<ProductAiSuggestion>;
  return {
    title: parsed.title?.trim() || '',
    category: allowedCats.includes(parsed.category || '')
      ? (parsed.category as string)
      : allowedCats[0],
    color: parsed.color?.trim() || '',
    shortDescription: parsed.shortDescription?.trim() || '',
  };
}
