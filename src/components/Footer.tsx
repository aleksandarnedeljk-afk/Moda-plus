import { useState } from 'react';
import { ChevronDown, ChevronUp, Lock, Mail, MessageCircle, PhoneCall } from 'lucide-react';
import { DEFAULT_LEGAL_PAGES, DEFAULT_STORE_SETTINGS } from '../config/storeConfig';
import type { LegalPageRecord, StoreSettings } from '../types/store';
import { formatRsd } from '../utils/storeLogic';
import {
  buildTelHref,
  buildViberDirectChatUrl,
  normalizeToInternationalPhone,
} from '../utils/viberLogic';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  settings?: StoreSettings;
  legalPages?: LegalPageRecord[];
  onNavigateLegal: (slug: string) => void;
  onNavigateAdmin: () => void;
}

export function Footer({
  settings = DEFAULT_STORE_SETTINGS,
  legalPages = DEFAULT_LEGAL_PAGES,
  onNavigateLegal,
  onNavigateAdmin,
}: FooterProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqItems = [
    {
      q: 'Kako se vrši plaćanje?',
      a: 'Plaćanje se vrši isključivo pouzećem — u gotovini kuriru Post Expressa tek kada paket stigne na vašu adresu. Nije potrebna kartica ni registracija.',
    },
    {
      q: 'Koliko traje isporuka?',
      a: `Sve porudžbine potvrđene radnim danima do 15:00h šaljemo istog dana. Paket stiže širom Srbije u roku od 24 do 48 sati. Cena dostave je ${formatRsd(settings.shippingCostRsd)}, a za porudžbine preko ${formatRsd(settings.freeShippingThresholdRsd)} ili paket od 3 artikla dostava je besplatna.`,
    },
    {
      q: 'Da li je moguća zamena veličine?',
      a: 'Da, ukoliko vam veličina ne odgovara, zamena za drugi dostupan broj ili drugi artikal moguća je u roku od 14 dana od preuzimanja pošiljke (artikal mora biti nenošen, sa originalnom etiketom).',
    },
  ];

  const intlPhone = normalizeToInternationalPhone(
    settings.contactViberNumber || settings.contactPhoneDisplay,
  );
  const phoneHref = buildTelHref(settings.contactPhoneDisplay || intlPhone);
  const viberHref = buildViberDirectChatUrl(intlPhone);

  return (
    <footer className="bg-[#121212] text-white border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
          {/* Left Brand & Clearance Notice */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <BrandLogo
                brandName={settings.brandName}
                brandSubtitle={settings.brandSubtitle}
                logoMonogram={settings.logoMonogram}
                variant="dark"
                size="lg"
                showSubtitle
              />
            </div>

            <p className="text-sm text-white/75 leading-relaxed max-w-md">
              {settings.secondarySlogan || 'Moda za celu porodicu po outlet cenama.'} Svi
              artikli su potpuno novi sa originalnom butik etiketom, pažljivo pregledani i
              spremni za slanje brzom poštom širom Srbije.
            </p>

            <div className="pt-2 flex flex-wrap gap-2">
              <a
                href={phoneHref}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white text-xs font-semibold transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="tabular-nums">Pozovi nas: {settings.contactPhoneDisplay}</span>
              </a>
              <a
                href={viberHref}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="tabular-nums">Viber: {intlPhone}</span>
              </a>
            </div>

            <div className="pt-1 space-y-1.5 text-xs text-white/75">
              <a
                href={`mailto:${settings.contactEmail}`}
                className="flex items-center gap-2 hover:text-white transition-colors w-fit"
              >
                <Mail className="w-3.5 h-3.5 text-[#C5A059]" aria-hidden="true" />
                <span>{settings.contactEmail}</span>
              </a>
              <p className="text-white/55">{settings.dispatchHours}</p>
            </div>

            {/* Legal & Info Links */}
            <div className="pt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/65">
              {legalPages.map((p) => (
                <a
                  key={p.slug}
                  href={`/${p.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateLegal(p.slug);
                  }}
                  className="hover:text-white underline-offset-4 hover:underline transition-colors"
                >
                  {p.title}
                </a>
              ))}
            </div>
          </div>

          {/* Right Collapsible FAQ Accordion */}
          <div className="lg:col-span-7">
            <h2 className="font-editorial text-xl font-semibold mb-4">
              Česta pitanja kupaca
            </h2>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {faqItems.map((item, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full py-4 flex items-center justify-between gap-4 text-left text-sm sm:text-[15px] font-medium text-white hover:text-[#C5A059] transition-colors cursor-pointer"
                    >
                      <span>{item.q}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 shrink-0 text-white/60" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 text-white/60" aria-hidden="true" />
                      )}
                    </button>
                    {isOpen && (
                      <p className="pb-4 text-xs sm:text-sm text-white/70 leading-relaxed max-w-2xl">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Legal & Subtle /admin Link */}
        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <p>
            © {new Date().getFullYear()} {settings.brandName} · Outlet rasprodaja
            novih zaliha do isteka količina.
          </p>

          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              onNavigateAdmin();
            }}
            className="inline-flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
          >
            <Lock className="w-3 h-3" aria-hidden="true" />
            <span>Admin ulaz</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
