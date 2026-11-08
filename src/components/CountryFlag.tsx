import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import qa from "flag-icons/flags/4x3/qa.svg";
import sa from "flag-icons/flags/4x3/sa.svg";
import ae from "flag-icons/flags/4x3/ae.svg";
import kw from "flag-icons/flags/4x3/kw.svg";
import bh from "flag-icons/flags/4x3/bh.svg";
import om from "flag-icons/flags/4x3/om.svg";
import eg from "flag-icons/flags/4x3/eg.svg";
import jo from "flag-icons/flags/4x3/jo.svg";
import lb from "flag-icons/flags/4x3/lb.svg";
import sy from "flag-icons/flags/4x3/sy.svg";
import iq from "flag-icons/flags/4x3/iq.svg";
import ye from "flag-icons/flags/4x3/ye.svg";
import ma from "flag-icons/flags/4x3/ma.svg";
import dz from "flag-icons/flags/4x3/dz.svg";
import tn from "flag-icons/flags/4x3/tn.svg";
import ly from "flag-icons/flags/4x3/ly.svg";
import sd from "flag-icons/flags/4x3/sd.svg";
import ps from "flag-icons/flags/4x3/ps.svg";
import pk from "flag-icons/flags/4x3/pk.svg";
import india from "flag-icons/flags/4x3/in.svg";
import bd from "flag-icons/flags/4x3/bd.svg";
import ph from "flag-icons/flags/4x3/ph.svg";
import id from "flag-icons/flags/4x3/id.svg";
import np from "flag-icons/flags/4x3/np.svg";
import us from "flag-icons/flags/4x3/us.svg";
import gb from "flag-icons/flags/4x3/gb.svg";
import fr from "flag-icons/flags/4x3/fr.svg";
import de from "flag-icons/flags/4x3/de.svg";
import it from "flag-icons/flags/4x3/it.svg";
import es from "flag-icons/flags/4x3/es.svg";

const FLAGS: Record<string, string> = {
  "قطر": qa, "السعودية": sa, "الإمارات": ae, "الكويت": kw,
  "البحرين": bh, "عمان": om, "مصر": eg, "الأردن": jo,
  "لبنان": lb, "سوريا": sy, "العراق": iq, "اليمن": ye,
  "المغرب": ma, "الجزائر": dz, "تونس": tn, "ليبيا": ly,
  "السودان": sd, "فلسطين": ps, "باكستان": pk, "الهند": india,
  "بنغلاديش": bd, "الفلبين": ph, "إندونيسيا": id, "نيبال": np,
  "أمريكا": us, "بريطانيا": gb, "فرنسا": fr, "ألمانيا": de,
  "إيطاليا": it, "أسبانيا": es, "إسبانيا": es,
};

export function CountryFlag({ nationality, className }: { nationality: string; className?: string }) {
  const src = FLAGS[nationality.trim()];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const size = cn("inline-block h-4 w-6 shrink-0 align-middle object-contain", className);
  if (!src || failedSrc === src) {
    return <Globe className={size} role="img" aria-label={nationality} />;
  }
  return <img src={src} width={24} height={16} alt={nationality} title={nationality} className={size} onError={() => setFailedSrc(src)} />;
}