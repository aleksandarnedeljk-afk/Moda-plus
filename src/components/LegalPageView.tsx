import { ArrowLeft, Mail, MessageCircle, PhoneCall, ShieldCheck } from 'lucide-react';
import type { LegalPageRecord, StoreSettings } from '../types/store';
import { buildTelHref, buildViberDirectChatUrl } from '../utils/viberLogic';

interface LegalPageViewProps {
  page: LegalPageRecord;
  allPages: LegalPageRecord[];
  settings: StoreSettings;
  onNavigatePage: (slug: string) => void;
  onBackHome: () => void;
}

export function LegalPageView({
  page,
  allPages,
  settings,
  onNavigatePage,
  onBackHome,
}: LegalPageViewProps) {
  const hasCompanyInfo =
    Boolean(settings.legalCompanyName?.trim()) &&
    Boolean(settings.legalPib?.trim()) &&
    Boolean(settings.legalMb?.trim());

  const phoneHref = buildTelHref(settings.contactPhoneDisplay || settings.contactViberNumber);
  const viberHref = buildViberDirectChatUrl(
    settings.contactViberNumber || settings.contactPhoneDisplay,
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <button
        type="button"
        onClick={onBackHome}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B6862] hover:text-[#121212] mb-5 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Nazad na katalog</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 space-y-2">
          <div className="bg-white border border-[#E6E2D8] rounded-2xl p-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6862] px-2 pb-2">
              Informacije za kupce
            </p>
            {allPages.map((item) => {
              const active = item.slug === page.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => onNavigatePage(item.slug)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#121212] text-white'
                      : 'text-[#121212] hover:bg-[#FAF9F6]'
                  }`}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </aside>

        <article className="lg:col-span-8 bg-white border border-[#E6E2D8] rounded-2xl p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#9F1239] font-semibold">
              {settings.brandName} · {settings.brandSubtitle}
            </p>
            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#121212] mt-1">
              {page.title}
            </h1>
            <p className="text-[11px] text-[#6B6862] mt-1">
              Poslednje ažuriranje:{' '}
              {new Date(page.updatedAt).toLocaleDateString('sr-RS')}
            </p>
          </div>

          <div className="prose prose-sm max-w-none text-sm text-[#121212] leading-relaxed whitespace-pre-line">
            {page.content}
          </div>

          {/* Legal Entity Details */}
          <div className="pt-5 border-t border-[#EAE5DA] space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#121212] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#9F1239]" aria-hidden="true" />
              Podaci o trgovcu i podršci
            </h2>

            {hasCompanyInfo ? (
              <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] text-xs space-y-1 text-[#121212]">
                <p>
                  <strong>Naziv:</strong> {settings.legalCompanyName}
                </p>
                {settings.legalSeatAddress && (
                  <p>
                    <strong>Sedište:</strong> {settings.legalSeatAddress}
                  </p>
                )}
                <p className="tabular-nums">
                  <strong>PIB:</strong> {settings.legalPib} · <strong>MB:</strong>{' '}
                  {settings.legalMb}
                </p>
                {settings.legalBankAccount && (
                  <p className="tabular-nums">
                    <strong>Tekući račun:</strong> {settings.legalBankAccount}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Podaci o pravnom licu / preduzetniku (poslovno ime, sedište, PIB i matični
                broj) još nisu uneti u podešavanjima prodavnice od strane vlasnika.
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 text-xs">
              <a
                href={phoneHref}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white font-semibold transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pozovi nas: {settings.contactPhoneDisplay}</span>
              </a>
              <a
                href={viberHref}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7360F2] hover:bg-[#5E4BD8] text-white font-semibold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Viber: {settings.contactPhoneDisplay}</span>
              </a>
              <a
                href={`mailto:${settings.contactEmail}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF9F6] border border-[#E6E2D8] text-[#121212] font-medium"
              >
                <Mail className="w-3.5 h-3.5 text-[#9F1239]" aria-hidden="true" />
                <span>{settings.contactEmail}</span>
              </a>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
