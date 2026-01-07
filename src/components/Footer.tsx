import { Shield } from "lucide-react";
import { Link } from "react-router-dom";
import visaLogo from "@/assets/visa-logo.png";
import mastercardLogo from "@/assets/mastercard-logo.png";
import applePayLogo from "@/assets/applepay-logo.png";
import sadadLogo from "@/assets/sadad-logo.png";
import handCursor from "@/assets/hand-cursor.png";
import { useSettings } from "@/contexts/SettingsContext";
export const Footer = () => {
  const {
    settings
  } = useSettings();
  return <footer 
    className="border-t backdrop-blur-sm mt-16" 
    style={{
      backgroundColor: "#E77E5A",
      ...(settings?.header_bg_image_url && {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4)), url(${settings.header_bg_image_url})`,
        backgroundRepeat: 'repeat-x',
        backgroundSize: 'auto 100%',
        backgroundPosition: 'center'
      })
    }} 
    dir="rtl"
  >
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Copyright */}
          <div className="text-center md:text-right">
            <p className="text-sm text-white">
              © {new Date().getFullYear()} {settings?.copyright_text || "جميع الحقوق محفوظة"}
            </p>
          </div>

          {/* Version */}
          <div className="text-center">
            <p className="text-xs text-white/70">v1.1</p>
          </div>

          {/* Payment Security */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-white" />
              <span className="text-sm font-semibold text-white">دفع آمن ومحمي</span>
            </div>
            <div className="h-8 w-px bg-white/30" />
            
            {/* Payment Methods */}
            <div className="flex items-center gap-2">
              <img src={visaLogo} alt="Visa" className="h-8 object-contain" loading="lazy" />
              <img src={mastercardLogo} alt="Mastercard" className="h-8 object-contain" loading="lazy" />
              <img src={applePayLogo} alt="Apple Pay" className="h-8 object-contain" loading="lazy" />
              <div className="h-8 w-px bg-white/30 mx-1" />
              <img src={sadadLogo} alt="Sadad Payment" className="h-8 object-contain" loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    </footer>;
};