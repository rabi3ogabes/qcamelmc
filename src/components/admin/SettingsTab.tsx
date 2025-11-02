import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SadadDiagnostic } from "./SadadDiagnostic";

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
  const [sadadWebsiteDomain, setSadadWebsiteDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingSadad, setSavingSadad] = useState(false);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [savingDeleteButton, setSavingDeleteButton] = useState(false);
  const [showGenerateQrButton, setShowGenerateQrButton] = useState(false);
  const [savingGenerateQrButton, setSavingGenerateQrButton] = useState(false);
  const [autoInvoiceInterval, setAutoInvoiceInterval] = useState(60);
  const [savingAutoInvoice, setSavingAutoInvoice] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, hero_image_url, header_bg_color, hero_text, copyright_text, webhook_url, admin_phone, sadad_merchant_id, sadad_api_key, sadad_secret, sadad_website_domain, show_delete_customer_button, show_generate_qr_button, auto_invoice_interval_seconds")
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
    if (data?.sadad_website_domain) setSadadWebsiteDomain(data.sadad_website_domain);
    if (data?.show_delete_customer_button !== undefined) setShowDeleteButton(data.show_delete_customer_button);
    if (data?.show_generate_qr_button !== undefined) setShowGenerateQrButton(data.show_generate_qr_button);
    if (data?.auto_invoice_interval_seconds !== undefined) setAutoInvoiceInterval(data.auto_invoice_interval_seconds);
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
            sadad_secret: sadadSecret,
            sadad_website_domain: sadadWebsiteDomain
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ 
            sadad_merchant_id: sadadMerchantId,
            sadad_api_key: sadadApiKey,
            sadad_secret: sadadSecret,
            sadad_website_domain: sadadWebsiteDomain
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

  const handleSaveAutoInvoiceInterval = async () => {
    if (autoInvoiceInterval < 10) {
      toast.error("يجب أن يكون الفاصل الزمني 10 ثوانٍ على الأقل");
      return;
    }

    setSavingAutoInvoice(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ auto_invoice_interval_seconds: autoInvoiceInterval })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ auto_invoice_interval_seconds: autoInvoiceInterval });

        if (error) throw error;
      }

      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving auto invoice interval:", error);
      toast.error("فشل في حفظ الإعداد");
    } finally {
      setSavingAutoInvoice(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold font-lusail">{t("settings")}</h2>

      <Tabs defaultValue="design" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="design" className="font-lusail">التصميم والعرض</TabsTrigger>
          <TabsTrigger value="integrations" className="font-lusail">التكاملات (n8n & Sadad)</TabsTrigger>
        </TabsList>

        <TabsContent value="design" className="space-y-6 mt-6">

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

          <Button onClick={handleSaveLogo} disabled={loading} className="font-lusail">
            <Upload className="w-4 h-4 ml-2" />
            {loading ? t("loading") : t("save")}
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
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6 mt-6">
          {/* n8n Webhook */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 font-lusail">رابط Webhook (n8n)</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="webhook-url-integration" className="font-lusail">رابط Webhook</Label>
                <div className="mt-2">
                  <Input 
                    id="webhook-url-integration" 
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

      {/* Auto Invoice Interval */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">إعدادات الإرسال التلقائي للفواتير</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="auto-invoice-interval" className="font-lusail">الفاصل الزمني (بالثواني)</Label>
            <Input 
              id="auto-invoice-interval" 
              type="number" 
              min="10"
              placeholder="60"
              value={autoInvoiceInterval}
              onChange={(e) => setAutoInvoiceInterval(parseInt(e.target.value) || 60)}
              className="mt-2 font-lusail" 
            />
            <p className="text-xs text-muted-foreground mt-2">
              الفاصل الزمني بين كل إرسال تلقائي للفواتير (الحد الأدنى: 10 ثوانٍ)
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              ⚠️ تنبيه: سيتم إرسال الفواتير تلقائياً حتى لو كان التطبيق مغلقاً
            </p>
          </div>
          
          <Button onClick={handleSaveAutoInvoiceInterval} disabled={savingAutoInvoice} className="font-lusail">
            {savingAutoInvoice ? t("loading") : t("save")}
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
          
          <div>
            <Label htmlFor="sadad-website-domain" className="font-lusail">النطاق المسجل (Website Domain)</Label>
            <Input 
              id="sadad-website-domain" 
              type="text" 
              placeholder="مثال: qcamelmc.org أو www.qcamelmc.org" 
              value={sadadWebsiteDomain}
              onChange={(e) => setSadadWebsiteDomain(e.target.value)}
              className="mt-2 font-lusail" 
            />
            <p className="text-xs text-muted-foreground mt-2">
              يجب أن يطابق النطاق المسجل في لوحة سداد تماماً عند إنشاء المفتاح السري
            </p>
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSaveSadad} disabled={savingSadad} className="font-lusail">
              {savingSadad ? t("loading") : t("save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Sadad Diagnostic Tool */}
      <SadadDiagnostic />

      {/* Sadad Troubleshooting Guide */}
      <Card className="p-6 border-orange-200 bg-orange-50/50">
        <h3 className="text-lg font-semibold mb-4 font-lusail text-orange-900">🔍 دليل استكشاف أخطاء سداد</h3>
        <div className="space-y-4 text-sm">
          <div className="bg-white p-4 rounded-lg border border-orange-100">
            <h4 className="font-bold text-red-600 mb-2">❌ خطأ: "Checksumhash did not match"</h4>
            <p className="text-gray-700 mb-3">
              هذا الخطأ يحدث عندما لا تتطابق بيانات الطلب مع ما هو مسجل في لوحة سداد. الأسباب الشائعة:
            </p>
            
            <div className="space-y-3">
              <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                <p className="font-bold text-yellow-900 mb-1">1️⃣ وضع الاختبار (Test Mode) غير مفعّل</p>
                <p className="text-yellow-800 text-xs">
                  يجب تفعيل وضع الاختبار من: لوحة التاجر → API → Test Mode (تبديل الزر)
                </p>
              </div>
              
              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <p className="font-bold text-blue-900 mb-1">2️⃣ النطاق (Domain) غير متطابق</p>
                <p className="text-blue-800 text-xs mb-2">
                  يجب أن يطابق النطاق أعلاه ما هو مسجل في لوحة سداد عند إنشاء المفتاح السري
                </p>
                <p className="text-blue-700 text-xs font-mono bg-blue-100 p-2 rounded">
                  النطاق الحالي: {sadadWebsiteDomain || "غير محدد"}
                </p>
                <p className="text-blue-800 text-xs mt-2">
                  ⚠️ انتبه: الفرق بين "qcamelmc.org" و "www.qcamelmc.org" مهم!
                </p>
              </div>
              
              <div className="bg-purple-50 p-3 rounded border border-purple-200">
                <p className="font-bold text-purple-900 mb-1">3️⃣ المفتاح السري غير صحيح</p>
                <p className="text-purple-800 text-xs">
                  جرب إعادة توليد المفتاح السري من: لوحة التاجر → API → Generate New Test Key
                </p>
              </div>
              
              <div className="bg-green-50 p-3 rounded border border-green-200">
                <p className="font-bold text-green-900 mb-1">4️⃣ Web Checkout 2.2 غير مفعّل</p>
                <p className="text-green-800 text-xs">
                  إذا لم يعمل بعد التحقق من النقاط السابقة، اتصل بدعم سداد لتفعيل Web Checkout 2.2
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-orange-100">
            <h4 className="font-bold text-gray-800 mb-2">✅ خطوات التحقق السريع:</h4>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 text-xs">
              <li>افتح <a href="https://webpanel.sadad.qa/authentication/login" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">لوحة التاجر سداد</a></li>
              <li>اذهب إلى قسم "API" من القائمة الجانبية</li>
              <li>تأكد أن زر "Test Mode" مفعّل (أخضر)</li>
              <li>تحقق من أن "Sadad ID" = <span className="font-mono bg-gray-100 px-2 py-1 rounded">{sadadMerchantId || "؟؟؟"}</span></li>
              <li>انسخ المفتاح السري الموجود والصقه أعلاه (بدون مسافات)</li>
              <li>تحقق من النطاق المسجل عند إنشاء المفتاح السري</li>
              <li>احفظ الإعدادات وجرب الدفع مرة أخرى</li>
            </ol>
          </div>
          
          <div className="bg-gray-50 p-3 rounded border border-gray-200">
            <p className="text-xs text-gray-600">
              💡 <strong>نصيحة:</strong> تحقق من سجلات Edge Function للحصول على تفاصيل أكثر عن الخطأ
            </p>
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
        </TabsContent>
      </Tabs>
    </div>
  );
};
