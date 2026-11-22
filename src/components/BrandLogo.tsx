interface BrandLogoProps {
  brandName?: string;
  brandSubtitle?: string;
  logoMonogram?: string;
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export function BrandLogo({
  brandName = 'MODA PLUS OUTLET',
  brandSubtitle = 'Odličan stil. Još bolje cene.',
  logoMonogram,
  variant = 'light',
  size = 'md',
  showSubtitle = true,
}: BrandLogoProps) {
  const cleanName = brandName.trim() || 'MODA PLUS OUTLET';
  const words = cleanName.split(/\s+/);
  const endsWithOutlet =
    words.length > 1 && words[words.length - 1].toUpperCase() === 'OUTLET';
  const primaryText = endsWithOutlet ? words.slice(0, -1).join(' ') : cleanName;
  const accentText = endsWithOutlet ? words[words.length - 1] : '';

  const computedMonogram =
    (logoMonogram || '').trim().slice(0, 3).toUpperCase() ||
    words
      .slice(0, 2)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase() ||
    'MP';

  const isDark = variant === 'dark';

  const emblemBoxSize =
    size === 'sm'
      ? 'w-7 h-7 rounded-md text-[11px]'
      : size === 'lg'
        ? 'w-11 h-11 rounded-xl text-sm'
        : 'w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-xs';

  const titleClass =
    size === 'sm'
      ? 'text-sm sm:text-base'
      : size === 'lg'
        ? 'text-xl sm:text-2xl'
        : 'text-[15px] sm:text-lg';

  const subtitleClass =
    size === 'lg'
      ? 'text-[11px] tracking-[0.14em]'
      : 'text-[9px] sm:text-[10px] tracking-[0.1em]';

  return (
    <span className="inline-flex items-center gap-2 sm:gap-2.5 select-none">
      {/* Architectural Monogram Emblem */}
      <span
        aria-hidden="true"
        className={`relative shrink-0 flex items-center justify-center font-editorial font-semibold tracking-wider border ${emblemBoxSize} ${
          isDark
            ? 'bg-[#1D1D1D] text-[#FAF9F6] border-[#C5A059]/60'
            : 'bg-[#121212] text-[#FAF9F6] border-[#C5A059]/70'
        }`}
      >
        <span>{computedMonogram}</span>
        <span className="absolute -bottom-0.5 left-1.5 right-1.5 h-[2px] rounded-full bg-[#9F1239]" />
      </span>

      {/* Typographic Wordmark + Slogan */}
      <span className="flex flex-col min-w-0 leading-none">
        <span
          className={`font-editorial font-semibold tracking-[0.06em] whitespace-nowrap flex items-baseline gap-1.5 ${titleClass} ${
            isDark ? 'text-[#FAF9F6]' : 'text-[#121212]'
          }`}
        >
          <span>{primaryText}</span>
          {accentText && (
            <span
              className={`font-sans font-bold text-[0.65em] tracking-[0.22em] ${
                isDark ? 'text-[#C5A059]' : 'text-[#9F1239]'
              }`}
            >
              {accentText}
            </span>
          )}
        </span>

        {showSubtitle && brandSubtitle && (
          <span
            className={`mt-1 whitespace-nowrap truncate max-w-[185px] sm:max-w-none font-medium ${subtitleClass} ${
              isDark ? 'text-white/65' : 'text-[#6B6862]'
            }`}
          >
            {brandSubtitle}
          </span>
        )}
      </span>
    </span>
  );
}
