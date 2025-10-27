import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield } from "lucide-react";
import visaLogo from "@/assets/visa-logo.png";
import mastercardLogo from "@/assets/mastercard-logo.png";
import applePayLogo from "@/assets/applepay-logo.png";
import sadadLogo from "@/assets/sadad-logo.png";

export const Footer = () => {
  const [copyrightText, setCopyrightText] = useState<string>("جميع الحقوق محفوظة");
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("copyright_text, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.copyright_text) {
      setCopyrightText(data.copyright_text);
    }

    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }
  };

  return (
    <footer className="border-t backdrop-blur-sm mt-16" style={{ backgroundColor: headerBgColor }} dir="rtl">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Copyright */}
          <div className="text-center md:text-right">
            <p className="text-sm text-white">
              © {new Date().getFullYear()} {copyrightText}
            </p>
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
              <img 
                src={visaLogo} 
                alt="Visa" 
                className="h-8 object-contain"
              />
              <img 
                src={mastercardLogo} 
                alt="Mastercard" 
                className="h-8 object-contain"
              />
              <img 
                src={applePayLogo} 
                alt="Apple Pay" 
                className="h-8 object-contain"
              />
              <div className="h-8 w-px bg-white/30 mx-1" />
              <img 
                src={sadadLogo} 
                alt="Sadad Payment" 
                className="h-8 object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
