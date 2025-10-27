import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const SettingsTab = () => {
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [newHeroImageUrl, setNewHeroImageUrl] = useState("");
  const [headerBgColor, setHeaderBgColor] = useState("hsl(var(--card) / 0.5)");
  const [newHeaderBgColor, setNewHeaderBgColor] = useState("hsl(var(--card) / 0.5)");
  const [heroText, setHeroText] = useState("");
  const [newHeroText, setNewHeroText] = useState("");
  const [copyrightText, setCopyrightText] = useState("");
  const [newCopyrightText, setNewCopyrightText] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [sadadMerchantId, setSadadMerchantId] = useState("");
  const [sadadApiKey, setSadadApiKey] = useState("");
  const [sadadSecret, setSadadSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingSadad, setSavingSadad] = useState(false);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [savingDeleteButton, setSavingDeleteButton] = useState(false);
  const [showGenerateQrButton, setShowGenerateQrButton] = useState(false);
  const [savingGenerateQrButton, setSavingGenerateQrButton] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, hero_image_url, header_bg_color, hero_text, copyright_text, webhook_url, admin_phone, sadad_merchant_id, sadad_api_key, sadad_secret, show_delete_customer_button, show_generate_qr_button")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
      setNewLogoUrl(data.logo_url);
    }

    if (data?.hero_image_url) {
      setHeroImageUrl(data.hero_image_url);
      setNewHeroImageUrl(data.hero_image_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
      setNewHeaderBgColor(data.header_bg_color);
    }

    if (data?.hero_text) {
      setHeroText(data.hero_text);
      setNewHeroText(data.hero_text);
    }

    if (data?.copyright_text) {
      setCopyrightText(data.copyright_text);
      setNewCopyrightText(data.copyright_text);
    }

    if (data?.webhook_url) {
      setWebhookUrl(data.webhook_url);
      setNewWebhookUrl(data.webhook_url);
    }

    if (data?.admin_phone) {
      setAdminPhone(data.admin_phone);
      setNewAdminPhone(data.admin_phone);
    }

    if (data?.sadad_merchant_id) setSadadMerchantId(data.sadad_merchant_id);
    if (data?.sadad_api_key) setSadadApiKey(data.sadad_api_key);
    if (data?.sadad_secret) setSadadSecret(data.sadad_secret);
    if (data?.show_delete_customer_button !== undefined) setShowDeleteButton(data.show_delete_customer_button);
    if (data?.show_generate_qr_button !== undefined) setShowGenerateQrButton(data.show_generate_qr_button);
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
          .update({ 
            logo_url: newLogoUrl, 
            hero_image_url: newHeroImageUrl,
            header_bg_color: newHeaderBgColor,
            hero_text: newHeroText,
            copyright_text: newCopyrightText,
            webhook_url: newWebhookUrl 
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ 
            logo_url: newLogoUrl, 
            hero_image_url: newHeroImageUrl,
            header_bg_color: newHeaderBgColor,
            hero_text: newHeroText,
            copyright_text: newCopyrightText,
            webhook_url: newWebhookUrl 
          });

        if (error) throw error;
      }

      setLogoUrl(newLogoUrl);
      setHeroImageUrl(newHeroImageUrl);
      setHeaderBgColor(newHeaderBgColor);
      setHeroText(newHeroText);
      setCopyrightText(newCopyrightText);
      setWebhookUrl(newWebhookUrl);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving logo:", error);
      toast.error("فشل في حفظ الشعار");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
      toast.error("يرجى اختيار صورة PNG أو JPG");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5 ميغابايت");
      return;
    }

    setLoading(true);
    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('qr-codes')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('qr-codes')
        .getPublicUrl(filePath);

      // Update settings with new logo URL
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .single();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ logo_url: publicUrl })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ logo_url: publicUrl });

        if (error) throw error;
      }

      setLogoUrl(publicUrl);
      setNewLogoUrl(publicUrl);
      toast.success("تم تحميل الشعار بنجاح");
      
      // Clear the input
      e.target.value = '';
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("فشل في تحميل الصورة");
    } finally {
      setLoading(false);
    }
  };

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
      toast.error("يرجى اختيار صورة PNG أو JPG");
      return;
    }

    // Validate file size (10MB max for hero images)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 10 ميغابايت");
      return;
    }

    setLoading(true);
    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `hero-${Date.now()}.${fileExt}`;
      const filePath = `hero-images/${fileName}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('qr-codes')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('qr-codes')
        .getPublicUrl(filePath);

      // Update settings with new hero image URL
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .single();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ hero_image_url: publicUrl })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ hero_image_url: publicUrl });

        if (error) throw error;
      }

      setHeroImageUrl(publicUrl);
      setNewHeroImageUrl(publicUrl);
      toast.success("تم تحميل صورة الخلفية بنجاح");
      
      // Clear the input
      e.target.value = '';
    } catch (error) {
      console.error("Error uploading hero image:", error);
      toast.error("فشل في تحميل الصورة");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdminPhone = async () => {
    setSavingPhone(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .single();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ admin_phone: newAdminPhone })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ admin_phone: newAdminPhone });

        if (error) throw error;
      }

      setAdminPhone(newAdminPhone);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving admin phone:", error);
      toast.error("فشل في حفظ رقم الهاتف");
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSaveSadad = async () => {
    setSavingSadad(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ 
            sadad_merchant_id: sadadMerchantId,
            sadad_api_key: sadadApiKey,
            sadad_secret: sadadSecret
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ 
            sadad_merchant_id: sadadMerchantId,
            sadad_api_key: sadadApiKey,
            sadad_secret: sadadSecret
          });

        if (error) throw error;
      }

      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving Sadad settings:", error);
      toast.error("فشل في حفظ إعدادات سداد");
    } finally {
      setSavingSadad(false);
    }
  };

  const handleToggleDeleteButton = async () => {
    setSavingDeleteButton(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      const newValue = !showDeleteButton;

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ show_delete_customer_button: newValue })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ show_delete_customer_button: newValue });

        if (error) throw error;
      }

      setShowDeleteButton(newValue);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving delete button setting:", error);
      toast.error("فشل في حفظ الإعداد");
    } finally {
      setSavingDeleteButton(false);
    }
  };

  const handleToggleGenerateQrButton = async (newValue: boolean) => {
    setSavingGenerateQrButton(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ show_generate_qr_button: newValue })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ show_generate_qr_button: newValue });

        if (error) throw error;
      }

      setShowGenerateQrButton(newValue);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving generate QR button setting:", error);
      toast.error("فشل في حفظ الإعداد");
    } finally {
      setSavingGenerateQrButton(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold font-lusail">{t("settings")}</h2>

      {/* Hero Background Image */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">صورة خلفية الصفحة الرئيسية</h3>
        <div className="space-y-4">
          <div>
            <Label className="font-lusail">الصورة الحالية</Label>
            <div className="mt-2 p-8 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
              {heroImageUrl ? (
                <img src={heroImageUrl} alt="Hero Background" className="max-h-48 object-cover rounded" />
              ) : (
                <ImageIcon className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
          </div>
          
          <div>
            <Label htmlFor="hero-url" className="font-lusail">رابط صورة الخلفية</Label>
            <div className="mt-2">
              <Input 
                id="hero-url" 
                type="url" 
                placeholder="https://example.com/hero-image.jpg"
                value={newHeroImageUrl}
                onChange={(e) => setNewHeroImageUrl(e.target.value)}
                className="font-lusail" 
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="hero-file" className="font-lusail">أو تحميل صورة (PNG/JPG)</Label>
            <div className="mt-2">
              <Input 
                id="hero-file" 
                type="file" 
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleHeroImageUpload}
                className="font-lusail cursor-pointer" 
              />
              <p className="text-xs text-muted-foreground mt-1 font-lusail">
                اختر صورة PNG أو JPG (حد أقصى 10 ميغابايت) - يفضل 1920x1080 بكسل
              </p>
            </div>
          </div>
        </div>
      </Card>

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
          
          <div>
            <Label htmlFor="logo-file" className="font-lusail">أو تحميل صورة (PNG/JPG)</Label>
            <div className="mt-2">
              <Input 
                id="logo-file" 
                type="file" 
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleLogoUpload}
                className="font-lusail cursor-pointer" 
              />
              <p className="text-xs text-muted-foreground mt-1 font-lusail">
                اختر صورة PNG أو JPG (حد أقصى 5 ميغابايت)
              </p>
            </div>
          </div>
          
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <Label htmlFor="header-bg" className="font-lusail">لون خلفية الترويسة</Label>
            <div className="mt-2 flex gap-2">
              <input 
                id="header-bg-picker"
                type="color"
                value={newHeaderBgColor.startsWith('#') ? newHeaderBgColor : '#ffffff'}
                onChange={(e) => setNewHeaderBgColor(e.target.value)}
                className="w-12 h-10 rounded border cursor-pointer"
              />
              <Input 
                id="header-bg" 
                type="text" 
                placeholder="#ffffff"
                value={newHeaderBgColor}
                onChange={(e) => setNewHeaderBgColor(e.target.value)}
                className="font-lusail" 
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              أدخل رمز لون hex (مثال: #ffffff) أو استخدم منتقي الألوان
            </p>
          </div>
          
          <div>
            <Label htmlFor="hero-text" className="font-lusail">نص الصفحة الرئيسية</Label>
            <div className="mt-2">
              <textarea
                id="hero-text"
                placeholder="أدخل النص الذي سيظهر في صورة الخلفية"
                value={newHeroText}
                onChange={(e) => setNewHeroText(e.target.value)}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-lusail"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1 font-lusail">
                النص الذي سيظهر في منتصف صورة الخلفية على الصفحة الرئيسية
              </p>
            </div>
          </div>
          
          <div>
            <Label htmlFor="copyright-text" className="font-lusail">نص حقوق الطبع</Label>
            <div className="mt-2">
              <Input 
                id="copyright-text" 
                type="text" 
                placeholder="جميع الحقوق محفوظة"
                value={newCopyrightText}
                onChange={(e) => setNewCopyrightText(e.target.value)}
                className="font-lusail" 
              />
              <p className="text-xs text-muted-foreground mt-1 font-lusail">
                النص الذي سيظهر في تذييل الصفحة
              </p>
            </div>
          </div>
          
          <div>
            <Label htmlFor="webhook-url" className="font-lusail">رابط Webhook (n8n)</Label>
            <div className="mt-2">
              <Input 
                id="webhook-url" 
                type="url" 
                placeholder="https://your-n8n-instance.com/webhook/..."
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                className="font-lusail" 
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              سيتم استدعاء هذا الرابط بعد كل حجز ناجح لإرسال الفاتورة
            </p>
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
            <Input 
              id="sadad-merchant-id" 
              placeholder="أدخل معرف التاجر" 
              value={sadadMerchantId}
              onChange={(e) => setSadadMerchantId(e.target.value)}
              className="mt-2 font-lusail" 
            />
          </div>
          
          <div>
            <Label htmlFor="sadad-api-key" className="font-lusail">رقم الدعم (Support Pin Number)</Label>
            <Input 
              id="sadad-api-key" 
              type="text" 
              placeholder="أدخل رقم الدعم" 
              value={sadadApiKey}
              onChange={(e) => setSadadApiKey(e.target.value)}
              className="mt-2 font-lusail" 
            />
            <p className="text-xs text-muted-foreground mt-2">
              رقم الدعم الخاص بحساب سداد - Support Pin Number
            </p>
          </div>
          
          <div>
            <Label htmlFor="sadad-secret" className="font-lusail">المفتاح السري</Label>
            <Input 
              id="sadad-secret" 
              type="password" 
              placeholder="أدخل المفتاح السري" 
              value={sadadSecret}
              onChange={(e) => setSadadSecret(e.target.value)}
              className="mt-2 font-lusail" 
            />
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSaveSadad} disabled={savingSadad} className="font-lusail">
              {savingSadad ? t("loading") : t("save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Admin Phone Number */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">رقم هاتف الإدارة</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="admin-phone" className="font-lusail">رقم الهاتف</Label>
            <Input 
              id="admin-phone" 
              type="tel" 
              placeholder="+974 XXXX XXXX"
              value={newAdminPhone}
              onChange={(e) => setNewAdminPhone(e.target.value)}
              className="mt-2 font-lusail" 
            />
            <p className="text-xs text-muted-foreground mt-2">
              رقم هاتف المسؤول للتواصل (مثال: +974 12345678)
            </p>
          </div>
          
          <Button onClick={handleSaveAdminPhone} disabled={savingPhone} className="font-lusail">
            {savingPhone ? t("loading") : t("save")}
          </Button>
        </div>
      </Card>

      {/* Delete Customer Button Visibility */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">إعدادات الأزرار</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="font-lusail">إظهار زر حذف العميل</Label>
              <p className="text-xs text-muted-foreground">
                عند التفعيل، سيظهر زر حذف العملاء في صفحة العملاء
              </p>
            </div>
            <Switch
              checked={showDeleteButton}
              onCheckedChange={handleToggleDeleteButton}
              disabled={savingDeleteButton}
            />
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-1">
              <Label className="font-lusail">إظهار زر إنشاء رموز QR</Label>
              <p className="text-xs text-muted-foreground">
                عند التفعيل، سيظهر زر إنشاء رموز QR في صفحة الطلبات
              </p>
            </div>
            <Switch
              checked={showGenerateQrButton}
              onCheckedChange={handleToggleGenerateQrButton}
              disabled={savingGenerateQrButton}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};
