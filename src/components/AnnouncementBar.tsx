import { STORE_CONFIG } from '../config/storeConfig';

interface AnnouncementBarProps {
  text?: string;
  holidayBannerActive?: boolean;
  holidayBannerText?: string;
}

export function AnnouncementBar({
  text,
  holidayBannerActive,
  holidayBannerText,
}: AnnouncementBarProps) {
  return (
    <div className="bg-[#121212] text-white text-[11px] sm:text-xs font-medium tracking-[0.02em] border-b border-white/10">
      <div className="py-2 px-3 text-center">
        <p className="max-w-7xl mx-auto leading-snug">
          {text || STORE_CONFIG.announcementText}
        </p>
      </div>
      {holidayBannerActive && holidayBannerText?.trim() && (
        <div className="bg-[#9F1239] text-white py-1.5 px-3 text-center text-[11px] font-semibold">
          <p className="max-w-7xl mx-auto leading-snug">{holidayBannerText}</p>
        </div>
      )}
    </div>
  );
}
