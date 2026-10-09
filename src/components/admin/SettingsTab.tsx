import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { SadadDiagnostic } from "./SadadDiagnostic";

/** Branding and display options anyone may read (logo, colours, texts, toggles). */
async function savePublicSettings(patch: TablesUpdate<"settings">) {
  const { data: row, error: lookupError } = await supabase.from("settings").select("id").limit(1).maybeSingle();
  if (lookupError) throw lookupError;
  const { error } = row
    ? await supabase.from("settings").update(patch).eq("id", row.id)
    : await supabase.from("settings").insert(patch);
  if (error) throw error;
}

/** Gateway credentials, webhook and admin phone: readable and writable by administrators only. */
async function savePrivateSettings(patch: TablesUpdate<"private_settings">) {
  const { error } = await supabase.from("private_settings").upsert({ singleton: true, ...patch }, { onConflict: "singleton" });
  if (error) throw error;
}

type SadadEnvironment = "auto" | "sandbox" | "live";

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
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [sadadMerchantId, setSadadMerchantId] = useState("");
  const [sadadSupportPin, setSadadSupportPin] = useState("");
  const [sadadSecret, setSadadSecret] = useState("");
  const [sadadWebsiteDomain, setSadadWebsiteDomain] = useState("");
  const [sadadEnvironment, setSadadEnvironment] = useState<SadadEnvironment>("auto");
  const [siteUrl, setSiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [savingSadad, setSavingSadad] = useState(false);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [savingDeleteButton, setSavingDeleteButton] = useState(false);
  const [showGenerateQrButton, setShowGenerateQrButton] = useState(false);
  const [savingGenerateQrButton, setSavingGenerateQrButton] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const [publicResult, privateResult] = await Promise.all([
      supabase
        .from("settings")
        .select("logo_url, hero_image_url, header_bg_color, hero_text, copyright_text, show_delete_customer_button, show_generate_qr_button")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("private_settings")
        .select("webhook_url, admin_phone, sadad_merchant_id, sadad_api_key, sadad_secret, sadad_website_domain, sadad_environment, site_url")
        .limit(1)
        .maybeSingle(),
    ]);

    if (publicResult.error) console.error("Error fetching settings:", publicResult.error);
    if (privateResult.error) console.error("Error fetching private settings:", privateResult.error);

    const data = publicResult.data;
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
    setShowDeleteButton(Boolean(data?.show_delete_customer_button));
    setShowGenerateQrButton(Boolean(data?.show_generate_qr_button));

    const secrets = privateResult.data;
    setNewWebhookUrl(secrets?.webhook_url ?? "");
    setNewAdminPhone(secrets?.admin_phone ?? "");
    setSadadMerchantId(secrets?.sadad_merchant_id ?? "");
    setSadadSupportPin(secrets?.sadad_api_key ?? "");
    setSadadSecret(secrets?.sadad_secret ?? "");
    setSadadWebsiteDomain(secrets?.sadad_website_domain ?? "");
    setSadadEnvironment((secrets?.sadad_environment as SadadEnvironment) ?? "auto");
    setSiteUrl(secrets?.site_url ?? "");
  };

  const handleSaveLogo = async () => {
    if (!newLogoUrl.trim()) {
      toast.error("الرجاء إدخال رابط الشعار");
      return;
    }

    setLoading(true);
    try {
      await savePublicSettings({
        logo_url: newLogoUrl,
        hero_image_url: newHeroImageUrl,
        header_bg_color: newHeaderBgColor,
        hero_text: newHeroText,
        copyright_text: newCopyrightText,
      });

      setLogoUrl(newLogoUrl);
      setHeroImageUrl(newHeroImageUrl);
      setHeaderBgColor(newHeaderBgColor);
      setHeroText(newHeroText);
      setCopyrightText(newCopyrightText);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving logo:", error);
      toast.error("فشل في حفظ الشعار");
    } finally {
      setLoading(false);
    }
  };

  /** Validate, upload an image to storage, and return its public URL (or null after showing why). */
  const uploadImage = async (file: File, folder: string, prefix: string, maxMb: number): Promise<string | null> => {
    if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
      toast.error("يرجى اختيار صورة PNG أو JPG");
      return null;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`حجم الصورة يجب أن يكون أقل من ${maxMb} ميغابايت`);
      return null;
    }
    const filePath = `${folder}/${prefix}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("qr-codes").upload(filePath, file, { cacheControl: "3600", upsert: true });
    if (error) throw error;
    return supabase.storage.from("qr-codes").getPublicUrl(filePath).data.publicUrl;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const publicUrl = await uploadImage(file, "logos", "logo", 5);
      if (!publicUrl) return;
      await savePublicSettings({ logo_url: publicUrl });
      setLogoUrl(publicUrl);
      setNewLogoUrl(publicUrl);
      toast.success("تم تحميل الشعار بنجاح");
      input.value = "";
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("فشل في تحميل الصورة");
    } finally {
      setLoading(false);
    }
  };

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const publicUrl = await uploadImage(file, "hero-images", "hero", 10);
      if (!publicUrl) return;
      await savePublicSettings({ hero_image_url: publicUrl });
      setHeroImageUrl(publicUrl);
      setNewHeroImageUrl(publicUrl);
      toast.success("تم تحميل صورة الخلفية بنجاح");
      input.value = "";
    } catch (error) {
      console.error("Error uploading hero image:", error);
      toast.error("فشل في تحميل الصورة");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAutomation = async () => {
    setSavingAutomation(true);
    try {
      await savePrivateSettings({
        webhook_url: newWebhookUrl.trim() || null,
        admin_phone: newAdminPhone.trim() || null,
      });
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving automation settings:", error);
      toast.error("فشل في حفظ الإعدادات");
    } finally {
      setSavingAutomation(false);
    }
  };

  const handleSaveSadad = async () => {
    setSavingSadad(true);
    try {
      await savePrivateSettings({
        sadad_merchant_id: sadadMerchantId.trim() || null,
        sadad_api_key: sadadSupportPin.trim() || null,
        sadad_secret: sadadSecret.trim() || null,
        sadad_website_domain: sadadWebsiteDomain.trim() || null,
        sadad_environment: sadadEnvironment,
        site_url: siteUrl.trim() || null,
      });
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
      const newValue = !showDeleteButton;
      await savePublicSettings({ show_delete_customer_button: newValue });
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
      await savePublicSettings({ show_generate_qr_button: newValue });
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
          

          <Button onClick={handleSaveLogo} disabled={loading} className="font-lusail">
            <Upload className="w-4 h-4 ml-2" />
            {loading ? t("loading") : t("save")}
          </Button>
        </div>
      </Card>

      {/* Automation (n8n) and notifications — administrators only */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">الأتمتة والإشعارات (n8n)</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="webhook-url" className="font-lusail">رابط Webhook (n8n)</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://your-n8n-instance.com/webhook/..."
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-2">
              يُستدعى عند اكتمال الحجز (الدفع عند الحضور أو بعد تأكيد الدفع عبر سداد) لإرسال التذاكر والفاتورة. هذا الرابط سري ولا يظهر للزوار.
            </p>
          </div>

          <div>
            <Label htmlFor="admin-phone" className="font-lusail">رقم هاتف الإدارة</Label>
            <Input
              id="admin-phone"
              type="tel"
              placeholder="+974 XXXX XXXX"
              value={newAdminPhone}
              onChange={(e) => setNewAdminPhone(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-2">
              رقم هاتف المسؤول للتواصل (مثال: +974 12345678)
            </p>
          </div>

          <Button onClick={handleSaveAutomation} disabled={savingAutomation} className="font-lusail">
            {savingAutomation ? t("loading") : t("save")}
          </Button>
        </div>
      </Card>

      {/* Sadad Payment Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">{t("sadadPayment")}</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sadad-merchant-id" className="font-lusail">معرف التاجر (Sadad ID / Merchant ID)</Label>
            <Input
              id="sadad-merchant-id"
              placeholder="أدخل معرف التاجر"
              value={sadadMerchantId}
              onChange={(e) => setSadadMerchantId(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
          </div>

          <div>
            <Label htmlFor="sadad-secret" className="font-lusail">المفتاح السري (Secret Key)</Label>
            <Input
              id="sadad-secret"
              type="password"
              autoComplete="off"
              placeholder="أدخل المفتاح السري"
              value={sadadSecret}
              onChange={(e) => setSadadSecret(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-2">
              مفتاح الاختبار يفتح بوابة الاختبار، ومفتاح الإنتاج يفتح بوابة الدفع الحقيقية. لا يظهر هذا المفتاح للزوار أبداً.
            </p>
          </div>

          <div>
            <Label htmlFor="sadad-website-domain" className="font-lusail">النطاق المسجل (Website)</Label>
            <Input
              id="sadad-website-domain"
              type="text"
              placeholder="مثال: qcamelmc.org"
              value={sadadWebsiteDomain}
              onChange={(e) => setSadadWebsiteDomain(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-2">
              يجب أن يطابق النطاق المسجل في لوحة سداد عند إنشاء المفتاح السري (بدون https:// وبدون مسار).
            </p>
          </div>

          <div>
            <Label htmlFor="sadad-environment" className="font-lusail">بيئة سداد</Label>
            <Select value={sadadEnvironment} onValueChange={(value) => setSadadEnvironment(value as SadadEnvironment)}>
              <SelectTrigger id="sadad-environment" className="mt-2 font-lusail">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">تلقائي (يكتشف الاختبار أو الإنتاج من المفتاح)</SelectItem>
                <SelectItem value="sandbox">اختبار فقط (Sandbox)</SelectItem>
                <SelectItem value="live">إنتاج فقط (Live)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="site-url" className="font-lusail">عنوان الموقع (اختياري)</Label>
            <Input
              id="site-url"
              type="url"
              placeholder="https://qcamelmc.org"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-2">
              إلى هذا العنوان يعود العميل بعد الدفع. اتركه فارغاً ليعود إلى العنوان الذي حجز منه.
            </p>
          </div>

          <div>
            <Label htmlFor="sadad-support-pin" className="font-lusail">رقم الدعم (Support Pin Number) — اختياري</Label>
            <Input
              id="sadad-support-pin"
              type="text"
              placeholder="أدخل رقم الدعم"
              value={sadadSupportPin}
              onChange={(e) => setSadadSupportPin(e.target.value)}
              className="mt-2 font-lusail"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-2">
              رقم الدعم الخاص بحساب سداد، للمراجعة فقط ولا يُستخدم في الدفع.
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSaveSadad} disabled={savingSadad} className="font-lusail">
              {savingSadad ? t("loading") : t("save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Readiness check: credentials, live verification with Sadad, URLs to register */}
      <SadadDiagnostic />

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
