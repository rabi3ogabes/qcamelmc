import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Settings {
  logo_url: string | null;
  hero_image_url: string | null;
  before_footer_image_url: string | null;
  header_bg_color: string;
  hero_text: string;
  copyright_text: string;
  admin_phone: string | null;
  auto_invoice_interval_seconds: number;
  invoice_batch_min: number;
  invoice_batch_max: number;
  invoice_send_delay_min: number;
  invoice_send_delay_max: number;
}

interface SettingsContextType {
  settings: Settings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("logo_url, hero_image_url, before_footer_image_url, header_bg_color, hero_text, copyright_text, admin_phone, auto_invoice_interval_seconds, invoice_batch_min, invoice_batch_max, invoice_send_delay_min, invoice_send_delay_max")
        .maybeSingle();

      if (error) throw error;

      setSettings({
        logo_url: data?.logo_url || null,
        hero_image_url: data?.hero_image_url || null,
        before_footer_image_url: data?.before_footer_image_url || null,
        header_bg_color: data?.header_bg_color || "hsl(var(--card) / 0.5)",
        hero_text: data?.hero_text || "",
        copyright_text: data?.copyright_text || "جميع الحقوق محفوظة",
        admin_phone: data?.admin_phone || null,
        auto_invoice_interval_seconds: data?.auto_invoice_interval_seconds || 60,
        invoice_batch_min: data?.invoice_batch_min || 1,
        invoice_batch_max: data?.invoice_batch_max || 10,
        invoice_send_delay_min: data?.invoice_send_delay_min || 300,
        invoice_send_delay_max: data?.invoice_send_delay_max || 600,
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const contextValue = useMemo(() => ({ settings, loading }), [settings, loading]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};
