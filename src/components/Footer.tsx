import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import visaLogo from "@/assets/visa-logo.png";
import mastercardLogo from "@/assets/mastercard-logo.png";
import applePayLogo from "@/assets/applepay-logo.png";
import sadadLogo from "@/assets/sadad-logo.png";
import footerLogo from "@/assets/mafareed-footer-logo.png.asset.json";
import { useSettings } from "@/contexts/SettingsContext";

export const Footer = () => {
  const { settings } = useSettings();
  return <footer className="public-site public-footer mt-8" dir="rtl" aria-label="معلومات الموقع">
    <div className="mx-auto max-w-7xl px-5 pb-8 pt-12 sm:px-8 sm:pt-16">
      <div className="flex flex-col items-center gap-8 text-center">
        <Link to="/" aria-label="مهرجان التحدي للمفاريد — الرئيسية">
          <img src={new URL(footerLogo.url, "https://www.qcamelmc.org").href} alt="مهرجان التحدي للمفاريد 2026" className="public-footer-logo" loading="lazy" decoding="async" />
        </Link>
        <nav aria-label="روابط الموقع" className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-lg font-bold">
          <Link to="/" className="hover:underline underline-offset-4">الفعاليات</Link>
          <Link to="/privacy" className="hover:underline underline-offset-4">سياسة الخصوصية</Link>
          <Link to="/terms" className="hover:underline underline-offset-4">الشروط والأحكام</Link>
        </nav>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
        <span className="inline-flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5" />دفع عبر سداد</span>
        <div className="flex flex-wrap items-center gap-3 rounded bg-background p-2">
          {[{src:visaLogo,alt:"Visa"},{src:mastercardLogo,alt:"Mastercard"},{src:applePayLogo,alt:"Apple Pay"},{src:sadadLogo,alt:"Sadad"}].map(logo => <img key={logo.alt} src={logo.src} alt={logo.alt} className="h-6 w-10 object-contain" loading="lazy" decoding="async" />)}
        </div>
      </div>
      <p className="public-footer-muted mt-7 text-center text-sm">© {new Date().getFullYear()} {settings?.copyright_text || "جميع الحقوق محفوظة"}</p>
    </div>
  </footer>;
};
