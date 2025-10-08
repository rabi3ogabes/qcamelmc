import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const SettingsTab = () => {
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [headerBgColor, setHeaderBgColor] = useState("hsl(var(--card) / 0.5)");
  const [newHeaderBgColor, setNewHeaderBgColor] = useState("hsl(var(--card) / 0.5)");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
      setNewLogoUrl(data.logo_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
      setNewHeaderBgColor(data.header_bg_color);
    }
  };

  const handleSaveLogo = async () => {
    if (!newLogoUrl.trim()) {
      toast.error("الرجاء إدخال رابط الشعار");
      return;
    }

    setLoading(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .single();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ logo_url: newLogoUrl, header_bg_color: newHeaderBgColor })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ logo_url: newLogoUrl, header_bg_color: newHeaderBgColor });

        if (error) throw error;
      }

      setLogoUrl(newLogoUrl);
      setHeaderBgColor(newHeaderBgColor);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving logo:", error);
      toast.error("فشل في حفظ الشعار");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold font-lusail">{t("settings")}</h2>

      {/* Logo Upload */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">{t("logoUpload")}</h3>
        <div className="space-y-4">
          <div>
            <Label className="font-lusail">{t("currentLogo")}</Label>
            <div className="mt-2 p-8 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="max-h-32 object-contain" />
              ) : (
                <ImageIcon className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
          </div>
          
          <div>
            <Label htmlFor="logo-url" className="font-lusail">رابط الشعار</Label>
            <div className="mt-2">
              <Input 
                id="logo-url" 
                type="url" 
                placeholder="https://example.com/logo.png"
                value={newLogoUrl}
                onChange={(e) => setNewLogoUrl(e.target.value)}
                className="font-lusail" 
              />
            </div>
          </div>
          
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <Label htmlFor="header-bg" className="font-lusail">لون خلفية الترويسة</Label>
            <div className="mt-2 flex gap-2">
              <Input 
                id="header-bg" 
                type="text" 
                placeholder="hsl(var(--card) / 0.5)"
                value={newHeaderBgColor}
                onChange={(e) => setNewHeaderBgColor(e.target.value)}
                className="font-lusail" 
              />
              <div 
                className="w-12 h-10 rounded border"
                style={{ backgroundColor: newHeaderBgColor }}
              />
            </div>
          </div>
          
          <Button onClick={handleSaveLogo} disabled={loading} className="font-lusail">
            <Upload className="w-4 h-4 ml-2" />
            {loading ? t("loading") : t("save")}
          </Button>
        </div>
      </Card>

      {/* Sadad Payment Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">{t("sadadPayment")}</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sadad-merchant-id" className="font-lusail">معرف التاجر (Merchant ID)</Label>
            <Input id="sadad-merchant-id" placeholder="أدخل معرف التاجر" className="mt-2 font-lusail" />
          </div>
          
          <div>
            <Label htmlFor="sadad-api-key" className="font-lusail">مفتاح API</Label>
            <Input id="sadad-api-key" type="password" placeholder="أدخل مفتاح API" className="mt-2 font-lusail" />
          </div>
          
          <div>
            <Label htmlFor="sadad-secret" className="font-lusail">المفتاح السري</Label>
            <Input id="sadad-secret" type="password" placeholder="أدخل المفتاح السري" className="mt-2 font-lusail" />
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button className="font-lusail">{t("save")}</Button>
            <Button variant="outline" className="font-lusail">{t("cancel")}</Button>
          </div>
        </div>
      </Card>

      {/* General Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">الإعدادات العامة</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="support-email" className="font-lusail">البريد الإلكتروني للدعم</Label>
            <Input id="support-email" type="email" placeholder="support@example.com" className="mt-2 font-lusail" />
          </div>
          
          <div>
            <Label htmlFor="support-phone" className="font-lusail">هاتف الدعم</Label>
            <Input id="support-phone" type="tel" placeholder="+974 XXXX XXXX" className="mt-2 font-lusail" />
          </div>
          
          <Button className="font-lusail">{t("save")}</Button>
        </div>
      </Card>
    </div>
  );
};
