import { Link } from "react-router-dom";
import footerLogo from "@/assets/mafareed-footer-logo.png.asset.json";
import { useSettings } from "@/contexts/SettingsContext";

export const Footer = () => {
  const { settings } = useSettings();
  return <footer className="public-site public-footer mt-8" dir="rtl" aria-label="معلومات الموقع">
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-7 px-5 pb-8 pt-12 text-center sm:px-8 sm:pt-16">
      <Link to="/" aria-label="مهرجان التحدي للمفاريد — الرئيسية">
        <img src={new URL(footerLogo.url, "https://www.qcamelmc.org").href} alt="مهرجان التحدي للمفاريد 2026" className="public-footer-logo" loading="lazy" decoding="async" />
      </Link>
      <p className="public-footer-muted text-center text-sm">{settings?.copyright_text || "جميع الحقوق محفوظة"}</p>
    </div>
  </footer>;
};
