import { Link } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";

export const PublicHeader = () => {
  const { settings } = useSettings();
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link to="/" aria-label="مهرجان قطر للإبل — الرئيسية" className="flex min-w-0 items-center gap-3">
          {settings?.logo_url && <img src={settings.logo_url} alt="مهرجان قطر للإبل" className="h-12 w-auto max-w-[140px] object-contain sm:h-14" decoding="async" />}
          <span className="hidden text-lg font-bold text-foreground sm:block">مهرجان قطر للإبل</span>
          {!settings?.logo_url && <span className="text-lg font-bold text-foreground sm:hidden">مهرجان قطر للإبل</span>}
        </Link>
        <Link to="/" className="shrink-0 text-sm font-semibold text-primary underline-offset-4 hover:underline">الفعاليات والتذاكر</Link>
      </div>
    </header>
  );
};