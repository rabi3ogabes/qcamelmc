import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

const SETTINGS_CACHE_KEY = "cached_settings";
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Settings {
  logo_url: string | null;
  hero_image_url: string | null;
  before_footer_image_url: string | null;
  header_bg_color: string;
  header_bg_image_url: string | null;
  hero_text: string;
  copyright_text: string;
  admin_phone: string | null;
  auto_invoice_interval_seconds: number;
  invoice_batch_min: number;
  invoice_batch_max: number;
  invoice_send_delay_min: number;
  invoice_send_delay_max: number;
  current_event_id: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  logo_url: null,
  hero_image_url: null,
  before_footer_image_url: null,
  header_bg_color: "#D4B78A",
  header_bg_image_url: null,
  hero_text: "",
  copyright_text: "جميع الحقوق محفوظة",
  admin_phone: null,
  auto_invoice_interval_seconds: 60,
  invoice_batch_min: 1,
  invoice_batch_max: 10,
  invoice_send_delay_min: 300,
  invoice_send_delay_max: 600,
  current_event_id: null,
};

interface SettingsContextType {
  settings: Settings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

const getCachedSettings = (): Settings | null => {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < SETTINGS_CACHE_TTL) return data;
    }
  } catch {
    // storage unavailable or unreadable: behave as if nothing was cached
  }
  return null;
};

const cacheSettings = (data: Settings) => {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // storage full or unavailable: the cache is only an optimisation
  }
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const cached = getCachedSettings();
  const [settings, setSettings] = useState<Settings | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("public_settings")
        .select("logo_url, hero_image_url, before_footer_image_url, header_bg_color, header_bg_image_url, hero_text, copyright_text, admin_phone, current_event_id")
        .maybeSingle();

      const resolved: Settings = {
        logo_url: data?.logo_url || null,
        hero_image_url: data?.hero_image_url || null,
        before_footer_image_url: data?.before_footer_image_url || null,
        header_bg_color: data?.header_bg_color || "#D4B78A",
        header_bg_image_url: data?.header_bg_image_url || null,
        hero_text: data?.hero_text || "",
        copyright_text: data?.copyright_text || "جميع الحقوق محفوظة",
        admin_phone: data?.admin_phone || null,
        auto_invoice_interval_seconds: 60,
        invoice_batch_min: 1,
        invoice_batch_max: 10,
        invoice_send_delay_min: 300,
        invoice_send_delay_max: 600,

        current_event_id: data?.current_event_id || null,
      };

      setSettings(resolved);
      cacheSettings(resolved);
    } catch (error) {
      console.error("Error fetching settings:", error);
      // Use cached or defaults on failure
      if (!settings) setSettings(DEFAULT_SETTINGS);
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
