import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon, Download, Trash2, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SadadDiagnostic } from "./SadadDiagnostic";
import * as XLSX from "xlsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export const SettingsTab = () => {
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [newHeroImageUrl, setNewHeroImageUrl] = useState("");
  const [beforeFooterImageUrl, setBeforeFooterImageUrl] = useState("");
  const [newBeforeFooterImageUrl, setNewBeforeFooterImageUrl] = useState("");
  const [headerBgImageUrl, setHeaderBgImageUrl] = useState("");
  const [newHeaderBgImageUrl, setNewHeaderBgImageUrl] = useState("");
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
  const [showDeleteEventButton, setShowDeleteEventButton] = useState(false);
  const [savingDeleteEventButton, setSavingDeleteEventButton] = useState(false);
  const [autoInvoiceInterval, setAutoInvoiceInterval] = useState(60);
  const [savingAutoInvoice, setSavingAutoInvoice] = useState(false);
  const [invoiceBatchMin, setInvoiceBatchMin] = useState(1);
  const [invoiceBatchMax, setInvoiceBatchMax] = useState(10);
  const [savingBatchSettings, setSavingBatchSettings] = useState(false);
  const [invoiceSendDelayMin, setInvoiceSendDelayMin] = useState(300);
  const [invoiceSendDelayMax, setInvoiceSendDelayMax] = useState(600);
  const [savingDelaySettings, setSavingDelaySettings] = useState(false);
  
  // Data management states
  const [deleteEventsDialog, setDeleteEventsDialog] = useState(false);
  const [deleteTicketsDialog, setDeleteTicketsDialog] = useState(false);
  const [deleteCustomersDialog, setDeleteCustomersDialog] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadEventsTemplate = () => {
    const templateData = [{
      title: "اسم الفعالية",
      description: "وصف الفعالية",
      event_date: "2025-01-15T18:00:00",
      location: "الموقع",
      image_url: "https://example.com/image.jpg",
      video_url: "https://example.com/video.mp4",
      display_order: 1,
      start_time: "18:00",
      end_time: "22:00",
      is_active: true
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 20 },
      { wch: 40 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Events Template");
    XLSX.writeFile(wb, "events_template.xlsx");
    toast.success("تم تحميل القالب بنجاح");
  };

  const handleImportEvents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      console.log("Parsed Excel data:", jsonData);

      if (jsonData.length === 0) {
        toast.error("الملف فارغ");
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      
      for (const row of jsonData) {
        // Helper to clean URL values (treat "#" or empty as null)
        const cleanUrl = (val: any) => {
          if (!val || val === "#" || val === "" || val === "-") return null;
          return String(val);
        };

        // Helper to parse boolean from various formats
        const parseBoolean = (val: any) => {
          if (val === true || val === "TRUE" || val === "true" || val === 1 || val === "1") return true;
          if (val === false || val === "FALSE" || val === "false" || val === 0 || val === "0") return false;
          return true; // default to active
        };

        // Helper to convert Excel time (decimal fraction of day) to "HH:mm" format
        const parseExcelTime = (val: any): string | null => {
          if (!val) return null;
          // If it's already a string like "11:00", return as-is
          if (typeof val === 'string' && val.includes(':')) {
            return val;
          }
          // If it's a decimal number (Excel time format)
          if (typeof val === 'number') {
            const totalMinutes = Math.round(val * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          }
          return null;
        };

        const eventData = {
          title: String(row.title || row["اسم الفعالية"] || "").trim(),
          description: row.description || row["وصف الفعالية"] || null,
          event_date: row.event_date || row["تاريخ الفعالية"] || new Date().toISOString(),
          location: String(row.location || row["الموقع"] || "").trim(),
          image_url: cleanUrl(row.image_url || row["رابط الصورة"]),
          video_url: cleanUrl(row.video_url || row["رابط الفيديو"]),
          display_order: Number(row.display_order) || Number(row["ترتيب العرض"]) || 0,
          start_time: parseExcelTime(row.start_time || row["وقت البداية"]),
          end_time: parseExcelTime(row.end_time || row["وقت النهاية"]),
          is_active: parseBoolean(row.is_active ?? row["نشط"])
        };

        console.log("Event data to insert:", eventData);

        if (!eventData.title || !eventData.location) {
          console.log("Skipping row - missing title or location:", row);
          continue;
        }

        const { error } = await supabase.from("events").insert(eventData);
        if (error) {
          console.error("Error inserting event:", error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`تم استيراد ${successCount} فعالية بنجاح`);
      }
      if (errorCount > 0) {
        toast.error(`فشل استيراد ${errorCount} فعالية`);
      }
      if (successCount === 0 && errorCount === 0) {
        toast.error("لم يتم العثور على بيانات صالحة للاستيراد");
      }
      
      e.target.value = "";
    } catch (error) {
      console.error("Error importing events:", error);
      toast.error("فشل في استيراد الفعاليات");
    } finally {
      setIsImporting(false);
    }
  };
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, hero_image_url, before_footer_image_url, header_bg_color, header_bg_image_url, hero_text, copyright_text, webhook_url, admin_phone, sadad_merchant_id, sadad_api_key, sadad_secret, sadad_website_domain, show_delete_customer_button, show_generate_qr_button, show_delete_event_button, auto_invoice_interval_seconds, invoice_batch_min, invoice_batch_max, invoice_send_delay_min, invoice_send_delay_max")
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

    if (data?.before_footer_image_url) {
      setBeforeFooterImageUrl(data.before_footer_image_url);
      setNewBeforeFooterImageUrl(data.before_footer_image_url);
    }

    if (data?.header_bg_image_url) {
      setHeaderBgImageUrl(data.header_bg_image_url);
      setNewHeaderBgImageUrl(data.header_bg_image_url);
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
    if (data?.show_delete_event_button !== undefined) setShowDeleteEventButton(data.show_delete_event_button);
    if (data?.auto_invoice_interval_seconds !== undefined) setAutoInvoiceInterval(data.auto_invoice_interval_seconds);
    if (data?.invoice_batch_min !== undefined) setInvoiceBatchMin(data.invoice_batch_min);
    if (data?.invoice_batch_max !== undefined) setInvoiceBatchMax(data.invoice_batch_max);
    if (data?.invoice_send_delay_min !== undefined) setInvoiceSendDelayMin(data.invoice_send_delay_min);
    if (data?.invoice_send_delay_max !== undefined) setInvoiceSendDelayMax(data.invoice_send_delay_max);
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

  const handleBeforeFooterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/image\/png/)) {
      toast.error("يرجى اختيار صورة PNG فقط");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 10 ميغابايت");
      return;
    }

    setLoading(true);
    try {
      // Create a unique filename
      const fileName = `before-footer-${Date.now()}.png`;
      const filePath = `before-footer/${fileName}`;

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

      // Update settings with new before footer image URL
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .single();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ before_footer_image_url: publicUrl })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ before_footer_image_url: publicUrl });

        if (error) throw error;
      }

      setBeforeFooterImageUrl(publicUrl);
      setNewBeforeFooterImageUrl(publicUrl);
      toast.success("تم تحميل الصورة بنجاح");
      
      // Clear the input
      e.target.value = '';
    } catch (error) {
      console.error("Error uploading before footer image:", error);
      toast.error("فشل في تحميل الصورة");
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
      toast.error("يرجى اختيار صورة PNG أو JPG");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 10 ميغابايت");
      return;
    }

    setLoading(true);
    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `header-bg-${Date.now()}.${fileExt}`;
      const filePath = `header-bg/${fileName}`;

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

      // Update settings with new header background image URL
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .single();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ header_bg_image_url: publicUrl })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ header_bg_image_url: publicUrl });

        if (error) throw error;
      }

      setHeaderBgImageUrl(publicUrl);
      setNewHeaderBgImageUrl(publicUrl);
      toast.success("تم تحميل صورة خلفية الترويسة بنجاح");
      
      // Clear the input
      e.target.value = '';
    } catch (error) {
      console.error("Error uploading header background image:", error);
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

  const handleToggleDeleteEventButton = async (newValue: boolean) => {
    setSavingDeleteEventButton(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ show_delete_event_button: newValue })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ show_delete_event_button: newValue });

        if (error) throw error;
      }

      setShowDeleteEventButton(newValue);
      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving delete event button setting:", error);
      toast.error("فشل في حفظ الإعداد");
    } finally {
      setSavingDeleteEventButton(false);
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

  const handleSaveBatchSettings = async () => {
    if (invoiceBatchMin < 1) {
      toast.error("يجب أن يكون الحد الأدنى 1 على الأقل");
      return;
    }
    if (invoiceBatchMax < invoiceBatchMin) {
      toast.error("يجب أن يكون الحد الأقصى أكبر من أو يساوي الحد الأدنى");
      return;
    }

    setSavingBatchSettings(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ 
            invoice_batch_min: invoiceBatchMin,
            invoice_batch_max: invoiceBatchMax
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ 
            invoice_batch_min: invoiceBatchMin,
            invoice_batch_max: invoiceBatchMax
          });

        if (error) throw error;
      }

      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving batch settings:", error);
      toast.error("فشل في حفظ الإعداد");
    } finally {
      setSavingBatchSettings(false);
    }
  };

  const handleSaveDelaySettings = async () => {
    if (invoiceSendDelayMin < 1) {
      toast.error("يجب أن يكون الحد الأدنى ثانية واحدة على الأقل");
      return;
    }
    if (invoiceSendDelayMax < invoiceSendDelayMin) {
      toast.error("يجب أن يكون الحد الأقصى أكبر من أو يساوي الحد الأدنى");
      return;
    }

    setSavingDelaySettings(true);
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("id")
        .maybeSingle();

      if (settings) {
        const { error } = await supabase
          .from("settings")
          .update({ 
            invoice_send_delay_min: invoiceSendDelayMin,
            invoice_send_delay_max: invoiceSendDelayMax
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ 
            invoice_send_delay_min: invoiceSendDelayMin,
            invoice_send_delay_max: invoiceSendDelayMax
          });

        if (error) throw error;
      }

      toast.success(t("savedSuccessfully"));
    } catch (error) {
      console.error("Error saving delay settings:", error);
      toast.error("فشل في حفظ الإعداد");
    } finally {
      setSavingDelaySettings(false);
    }
  };

  // Backup and Delete Functions
  const downloadAsExcel = (data: any[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleBackupEvents = async () => {
    setIsBackingUp(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }

      downloadAsExcel(data, "events_backup");
      toast.success(`تم تصدير ${data.length} فعالية بنجاح`);
    } catch (error) {
      console.error("Error backing up events:", error);
      toast.error("فشل في تصدير البيانات");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteAllEvents = async () => {
    setIsDeleting(true);
    try {
      // First delete all tickets (they reference events)
      const { error: ticketsError } = await supabase
        .from("tickets")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (ticketsError) throw ticketsError;

      // Then delete all events
      const { error: eventsError } = await supabase
        .from("events")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (eventsError) throw eventsError;

      toast.success("تم حذف جميع الفعاليات بنجاح");
      setDeleteEventsDialog(false);
    } catch (error) {
      console.error("Error deleting events:", error);
      toast.error("فشل في حذف الفعاليات");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBackupTickets = async () => {
    setIsBackingUp(true);
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, events(title, event_date)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }

      // Flatten the data for Excel
      const flatData = data.map(ticket => ({
        ...ticket,
        event_title: ticket.events?.title,
        event_date: ticket.events?.event_date,
        events: undefined
      }));

      downloadAsExcel(flatData, "tickets_backup");
      toast.success(`تم تصدير ${data.length} تذكرة بنجاح`);
    } catch (error) {
      console.error("Error backing up tickets:", error);
      toast.error("فشل في تصدير البيانات");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteAllTickets = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) throw error;

      toast.success("تم حذف جميع التذاكر بنجاح");
      setDeleteTicketsDialog(false);
    } catch (error) {
      console.error("Error deleting tickets:", error);
      toast.error("فشل في حذف التذاكر");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBackupCustomers = async () => {
    setIsBackingUp(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }

      downloadAsExcel(data, "customers_backup");
      toast.success(`تم تصدير ${data.length} عميل بنجاح`);
    } catch (error) {
      console.error("Error backing up customers:", error);
      toast.error("فشل في تصدير البيانات");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteAllCustomers = async () => {
    setIsDeleting(true);
    try {
      // First delete ticket_holders (they reference orders which reference customers)
      const { error: holdersError } = await supabase
        .from("ticket_holders")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (holdersError) throw holdersError;

      // Then delete orders
      const { error: ordersError } = await supabase
        .from("orders")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (ordersError) throw ordersError;

      // Finally delete customers
      const { error: customersError } = await supabase
        .from("customers")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (customersError) throw customersError;

      toast.success("تم حذف جميع العملاء بنجاح");
      setDeleteCustomersDialog(false);
    } catch (error) {
      console.error("Error deleting customers:", error);
      toast.error("فشل في حذف العملاء");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold font-lusail">{t("settings")}</h2>

      <Tabs defaultValue="design" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="design" className="font-lusail">التصميم والعرض</TabsTrigger>
          <TabsTrigger value="integrations" className="font-lusail">التكاملات (n8n & Sadad)</TabsTrigger>
          <TabsTrigger value="data" className="font-lusail">إدارة البيانات</TabsTrigger>
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

      {/* Before Footer Image */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">صورة قبل الفوتر</h3>
        <div className="space-y-4">
          <div>
            <Label className="font-lusail">الصورة الحالية</Label>
            <div className="mt-2 p-8 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
              {beforeFooterImageUrl ? (
                <img src={beforeFooterImageUrl} alt="Before Footer" className="max-h-48 object-contain rounded" />
              ) : (
                <ImageIcon className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
          </div>
          
          <div>
            <Label htmlFor="before-footer-file" className="font-lusail">تحميل صورة PNG</Label>
            <div className="mt-2">
              <Input 
                id="before-footer-file" 
                type="file" 
                accept="image/png"
                onChange={handleBeforeFooterImageUpload}
                className="font-lusail cursor-pointer" 
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1 font-lusail">
                اختر صورة PNG فقط (حد أقصى 10 ميغابايت) - ستظهر قبل الفوتر مباشرة
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Header Background Image */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">صورة خلفية الترويسة (الصفحة الرئيسية)</h3>
        <div className="space-y-4">
          <div>
            <Label className="font-lusail">الصورة الحالية</Label>
            <div className="mt-2 p-8 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 relative overflow-hidden">
              {headerBgImageUrl ? (
                <>
                  <img src={headerBgImageUrl} alt="Header Background" className="max-h-32 object-cover rounded" />
                  <div 
                    className="absolute inset-0 pointer-events-none" 
                    style={{ background: 'linear-gradient(to left, rgba(0,0,0,0.8), rgba(0,0,0,0.4))' }}
                  />
                  <span className="absolute text-white text-xs font-lusail">معاينة التدرج</span>
                </>
              ) : (
                <ImageIcon className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
          </div>
          
          <div>
            <Label htmlFor="header-bg-file" className="font-lusail">تحميل صورة (PNG/JPG)</Label>
            <div className="mt-2">
              <Input 
                id="header-bg-file" 
                type="file" 
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleHeaderBgImageUpload}
                className="font-lusail cursor-pointer" 
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1 font-lusail">
                اختر صورة PNG أو JPG (حد أقصى 10 ميغابايت) - ستظهر خلف الترويسة مع تدرج شفافية 80% إلى 40%
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
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-1">
              <Label className="font-lusail">إظهار زر حذف الفعالية</Label>
              <p className="text-xs text-muted-foreground">
                عند التفعيل، سيظهر زر حذف الفعالية في صفحة الفعاليات
              </p>
            </div>
            <Switch
              checked={showDeleteEventButton}
              onCheckedChange={handleToggleDeleteEventButton}
              disabled={savingDeleteEventButton}
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

      {/* Invoice Batch Size Range */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">نطاق عدد الفواتير المرسلة</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="invoice-batch-min" className="font-lusail">الحد الأدنى</Label>
              <Input 
                id="invoice-batch-min" 
                type="number" 
                min="1"
                placeholder="1"
                value={invoiceBatchMin}
                onChange={(e) => setInvoiceBatchMin(parseInt(e.target.value) || 1)}
                className="mt-2 font-lusail" 
              />
            </div>
            <div>
              <Label htmlFor="invoice-batch-max" className="font-lusail">الحد الأقصى</Label>
              <Input 
                id="invoice-batch-max" 
                type="number" 
                min="1"
                placeholder="10"
                value={invoiceBatchMax}
                onChange={(e) => setInvoiceBatchMax(parseInt(e.target.value) || 10)}
                className="mt-2 font-lusail" 
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            عند الضغط على "بدء العد التنازلي" أو "إرسال الفواتير"، سيتم إرسال عدد الفواتير بين الحد الأدنى والأقصى
          </p>
          
          <Button onClick={handleSaveBatchSettings} disabled={savingBatchSettings} className="font-lusail">
            {savingBatchSettings ? t("loading") : t("save")}
          </Button>
        </div>
      </Card>

      {/* Invoice Send Delay Range */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 font-lusail">التأخير بين إرسال الفواتير (بالثواني)</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="invoice-delay-min" className="font-lusail">الحد الأدنى (ثانية)</Label>
              <Input 
                id="invoice-delay-min" 
                type="number" 
                min="1"
                placeholder="300"
                value={invoiceSendDelayMin}
                onChange={(e) => setInvoiceSendDelayMin(parseInt(e.target.value) || 300)}
                className="mt-2 font-lusail" 
              />
            </div>
            <div>
              <Label htmlFor="invoice-delay-max" className="font-lusail">الحد الأقصى (ثانية)</Label>
              <Input 
                id="invoice-delay-max" 
                type="number" 
                min="1"
                placeholder="600"
                value={invoiceSendDelayMax}
                onChange={(e) => setInvoiceSendDelayMax(parseInt(e.target.value) || 600)}
                className="mt-2 font-lusail" 
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            الوقت العشوائي للانتظار بين إرسال كل فاتورة والتالية (بالثواني)
          </p>
          <p className="text-xs text-yellow-600">
            مثال: إذا كانت القيمة من 300 إلى 600 ثانية، سيتم الانتظار بين 5 إلى 10 دقائق بين كل فاتورة
          </p>
          
          <Button onClick={handleSaveDelaySettings} disabled={savingDelaySettings} className="font-lusail">
            {savingDelaySettings ? t("loading") : t("save")}
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

        {/* Data Management Tab */}
        <TabsContent value="data" className="space-y-6 mt-6">
          <Card className="p-6 border-red-200 bg-red-50/50">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold font-lusail text-red-900">تحذير: منطقة خطرة</h3>
            </div>
            <p className="text-sm text-red-800 mb-6">
              العمليات التالية لا يمكن التراجع عنها. يرجى التأكد من عمل نسخة احتياطية قبل الحذف.
            </p>

            {/* Events Backup & Delete */}
            <div className="space-y-4 mb-6">
              <h4 className="font-semibold font-lusail border-b pb-2">إدارة الفعاليات</h4>
              <div className="flex gap-3 flex-wrap">
                <Button 
                  variant="outline" 
                  onClick={handleDownloadEventsTemplate}
                  className="font-lusail"
                >
                  <Download className="w-4 h-4 ml-2" />
                  تحميل القالب
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => document.getElementById('import-events-file')?.click()}
                  disabled={isImporting}
                  className="font-lusail"
                >
                  <Upload className="w-4 h-4 ml-2" />
                  {isImporting ? "جاري الاستيراد..." : "استيراد فعاليات"}
                </Button>
                <input
                  id="import-events-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportEvents}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  onClick={handleBackupEvents}
                  disabled={isBackingUp}
                  className="font-lusail"
                >
                  <Download className="w-4 h-4 ml-2" />
                  {isBackingUp ? "جاري التصدير..." : "تصدير الفعاليات"}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteEventsDialog(true)}
                  disabled={isDeleting}
                  className="font-lusail"
                >
                  <Trash2 className="w-4 h-4 ml-2" />
                  حذف جميع الفعاليات
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ⚠️ حذف الفعاليات سيحذف أيضاً جميع التذاكر المرتبطة بها
              </p>
            </div>

            {/* Tickets Backup & Delete */}
            <div className="space-y-4 mb-6">
              <h4 className="font-semibold font-lusail border-b pb-2">إدارة التذاكر</h4>
              <div className="flex gap-3 flex-wrap">
                <Button 
                  variant="outline" 
                  onClick={handleBackupTickets}
                  disabled={isBackingUp}
                  className="font-lusail"
                >
                  <Download className="w-4 h-4 ml-2" />
                  {isBackingUp ? "جاري التصدير..." : "تصدير التذاكر"}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteTicketsDialog(true)}
                  disabled={isDeleting}
                  className="font-lusail"
                >
                  <Trash2 className="w-4 h-4 ml-2" />
                  حذف جميع التذاكر
                </Button>
              </div>
            </div>

            {/* Customers Backup & Delete */}
            <div className="space-y-4">
              <h4 className="font-semibold font-lusail border-b pb-2">إدارة العملاء</h4>
              <div className="flex gap-3 flex-wrap">
                <Button 
                  variant="outline" 
                  onClick={handleBackupCustomers}
                  disabled={isBackingUp}
                  className="font-lusail"
                >
                  <Download className="w-4 h-4 ml-2" />
                  {isBackingUp ? "جاري التصدير..." : "تصدير العملاء"}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteCustomersDialog(true)}
                  disabled={isDeleting}
                  className="font-lusail"
                >
                  <Trash2 className="w-4 h-4 ml-2" />
                  حذف جميع العملاء
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ⚠️ حذف العملاء سيحذف أيضاً جميع الطلبات وحاملي التذاكر المرتبطين بهم
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Events Confirmation Dialog */}
      <AlertDialog open={deleteEventsDialog} onOpenChange={setDeleteEventsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-lusail">تأكيد حذف جميع الفعاليات</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف جميع الفعاليات؟ سيتم أيضاً حذف جميع التذاكر المرتبطة بها.
              هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-lusail">إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAllEvents} 
              className="bg-red-600 hover:bg-red-700 font-lusail"
              disabled={isDeleting}
            >
              {isDeleting ? "جاري الحذف..." : "نعم، احذف الكل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Tickets Confirmation Dialog */}
      <AlertDialog open={deleteTicketsDialog} onOpenChange={setDeleteTicketsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-lusail">تأكيد حذف جميع التذاكر</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف جميع التذاكر؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-lusail">إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAllTickets} 
              className="bg-red-600 hover:bg-red-700 font-lusail"
              disabled={isDeleting}
            >
              {isDeleting ? "جاري الحذف..." : "نعم، احذف الكل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Customers Confirmation Dialog */}
      <AlertDialog open={deleteCustomersDialog} onOpenChange={setDeleteCustomersDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-lusail">تأكيد حذف جميع العملاء</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف جميع العملاء؟ سيتم أيضاً حذف جميع الطلبات وحاملي التذاكر.
              هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-lusail">إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAllCustomers} 
              className="bg-red-600 hover:bg-red-700 font-lusail"
              disabled={isDeleting}
            >
              {isDeleting ? "جاري الحذف..." : "نعم، احذف الكل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
