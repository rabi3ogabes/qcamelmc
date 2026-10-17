import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import visaLogo from "@/assets/visa-logo.png";
import mastercardLogo from "@/assets/mastercard-logo.png";
import applePayLogo from "@/assets/applepay-logo.png";
import sadadLogo from "@/assets/sadad-logo.png";
import { useSettings } from "@/contexts/SettingsContext";

export const Footer = () => {
  const { settings } = useSettings();
  return <footer className="public-site public-footer mt-8" dir="rtl" aria-label="معلومات الموقع">
    <div className="public-heritage-strip" aria-hidden="true" />
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="grid gap-8 sm:grid-cols-2">
        <div><p className="text-xl font-bold">مهرجان قطر للإبل</p><p className="public-footer-muted mt-3 text-sm">© {new Date().getFullYear()} {settings?.copyright_text || "جميع الحقوق محفوظة"}</p></div>
        <nav aria-label="روابط الموقع" className="flex flex-wrap items-start gap-x-6 gap-y-4 text-sm sm:justify-end">
          <Link to="/" className="hover:underline underline-offset-4">الفعاليات</Link>
          <Link to="/privacy" className="hover:underline underline-offset-4">سياسة الخصوصية</Link>
          <Link to="/terms" className="hover:underline underline-offset-4">الشروط والأحكام</Link>
        </nav>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-border/20 pt-6">
        <span className="public-footer-muted inline-flex items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5" />دفع عبر سداد</span>
        <div className="flex flex-wrap items-center gap-3 rounded bg-background p-2">
          {[{src:visaLogo,alt:"Visa"},{src:mastercardLogo,alt:"Mastercard"},{src:applePayLogo,alt:"Apple Pay"},{src:sadadLogo,alt:"Sadad"}].map(logo => <img key={logo.alt} src={logo.src} alt={logo.alt} className="h-6 w-10 object-contain" loading="lazy" decoding="async" />)}
        </div>
      </div>
    </div>
  </footer>;
};
