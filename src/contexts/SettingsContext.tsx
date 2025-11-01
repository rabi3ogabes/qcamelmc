import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Settings {
  logo_url: string | null;
  hero_image_url: string | null;
  header_bg_color: string;
  hero_text: string;
  copyright_text: string;
  auto_invoice_interval_seconds: number;
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
        .select("logo_url, hero_image_url, header_bg_color, hero_text, copyright_text, auto_invoice_interval_seconds")
        .maybeSingle();

      if (error) throw error;

      setSettings({
        logo_url: data?.logo_url || null,
        hero_image_url: data?.hero_image_url || null,
        header_bg_color: data?.header_bg_color || "hsl(var(--card) / 0.5)",
        hero_text: data?.hero_text || "",
        copyright_text: data?.copyright_text || "جميع الحقوق محفوظة",
        auto_invoice_interval_seconds: data?.auto_invoice_interval_seconds || 60,
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
