import { Link } from "react-router-dom";
import mafareedLogo from "@/assets/mafareed-logo.png.asset.json";
import clubLogo from "@/assets/qcmc-logo-black.svg.asset.json";

export const PublicHeader = () => {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link to="/" aria-label="مهرجان التحدي للمفاريد — الرئيسية" className="flex min-w-0 items-center gap-3">
          <img src={new URL(mafareedLogo.url, "https://www.qcamelmc.org").href} alt="مهرجان التحدي للمفاريد 2026" className="h-16 w-auto min-w-[110px] shrink-0 object-contain sm:h-20" decoding="async" />
        </Link>
        <Link to="/" aria-label="نادي قطر لمزاين الإبل — الرئيسية" className="shrink-0">
          <img src={new URL(clubLogo.url, "https://www.qcamelmc.org").href} alt="نادي قطر لمزاين الإبل — Qatar Camel Mzayen Club" className="h-10 w-auto sm:h-12" loading="lazy" decoding="async" />
        </Link>
      </div>
      <div className="public-heritage-strip" aria-hidden="true" />
    </header>
  );
};
