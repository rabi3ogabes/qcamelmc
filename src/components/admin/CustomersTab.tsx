import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { toWhatsAppNumber } from "@/lib/phone";
import { User, Phone, Mail, Ticket, Calendar, Send, MessageCircle, Edit, QrCode, Trash2, UserX, CreditCard, Archive, Folder, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationality?: string;
  country_code?: string | null;
  created_at: string;
  orders: Array<{
    id: string;
    booking_reference: string;
    ticket_type: string;
    quantity: number;
    total_amount: number;
    payment_status: string;
    payment_method: string;
    created_at: string;
    qr_code?: string;
    event_location?: string;
    event_date?: string;
    event_title?: string;
    event_archived?: boolean;
    ticket_holders: Array<{
      id: string;
      name: string;
      phone: string;
      country_code?: string;
      nationality: string;
      ticket_type: string;
      qr_code?: string;
      is_present: boolean;
      id_number?: string;
    }>;
  }>;
}

const getCountryFlag = (nationality: string): string => {
  const countryFlags: Record<string, string> = {
    // Arabic names
    'قطر': '🇶🇦',
    'السعودية': '🇸🇦',
    'الإمارات': '🇦🇪',
    'الكويت': '🇰🇼',
    'البحرين': '🇧🇭',
    'عمان': '🇴🇲',
    'مصر': '🇪🇬',
    'الأردن': '🇯🇴',
    'لبنان': '🇱🇧',
    'سوريا': '🇸🇾',
    'العراق': '🇮🇶',
    'اليمن': '🇾🇪',
    'فلسطين': '🇵🇸',
    'المغرب': '🇲🇦',
    'تونس': '🇹🇳',
    'الجزائر': '🇩🇿',
    'ليبيا': '🇱🇾',
    'السودان': '🇸🇩',
    'الهند': '🇮🇳',
    'باكستان': '🇵🇰',
    'بنغلاديش': '🇧🇩',
    'الفلبين': '🇵🇭',
    'نيبال': '🇳🇵',
    'سريلانكا': '🇱🇰',
    // English names
    'qatar': '🇶🇦',
    'saudi': '🇸🇦',
    'saudi arabia': '🇸🇦',
    'uae': '🇦🇪',
    'united arab emirates': '🇦🇪',
    'emirates': '🇦🇪',
    'kuwait': '🇰🇼',
    'bahrain': '🇧🇭',
    'oman': '🇴🇲',
    'egypt': '🇪🇬',
    'jordan': '🇯🇴',
    'lebanon': '🇱🇧',
    'syria': '🇸🇾',
    'iraq': '🇮🇶',
    'yemen': '🇾🇪',
    'palestine': '🇵🇸',
    'morocco': '🇲🇦',
    'tunisia': '🇹🇳',
    'algeria': '🇩🇿',
    'libya': '🇱🇾',
    'sudan': '🇸🇩',
    'india': '🇮🇳',
    'pakistan': '🇵🇰',
    'bangladesh': '🇧🇩',
    'philippines': '🇵🇭',
    'nepal': '🇳🇵',
    'sri lanka': '🇱🇰',
    'usa': '🇺🇸',
    'uk': '🇬🇧',
    'united kingdom': '🇬🇧',
    'canada': '🇨🇦',
    'australia': '🇦🇺',
    'france': '🇫🇷',
    'germany': '🇩🇪',
    'italy': '🇮🇹',
    'spain': '🇪🇸',
  };
  
  const normalized = nationality.toLowerCase().trim();
  return countryFlags[normalized] || '🌐';
};

export const CustomersTab = () => {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sendingTicket, setSendingTicket] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", nationality: "" });
  const [saving, setSaving] = useState(false);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [viewingQrCode, setViewingQrCode] = useState<{ code: string; name: string; reference: string } | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [editingTicketHolder, setEditingTicketHolder] = useState<string | null>(null);
  const [ticketHolderEditForm, setTicketHolderEditForm] = useState({ phone: "", country_code: "" });
  const [sendingSingleTicket, setSendingSingleTicket] = useState<string | null>(null);
  const [phoneTicketCounts, setPhoneTicketCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<"current" | "archived">("current");

  const gulfNationalities = [
    { name: "قطر", flag: "🇶🇦" },
    { name: "السعودية", flag: "🇸🇦" },
    { name: "الإمارات", flag: "🇦🇪" },
    { name: "الكويت", flag: "🇰🇼" },
    { name: "البحرين", flag: "🇧🇭" },
    { name: "عمان", flag: "🇴🇲" },
  ];

  const otherNationalities = [
    { name: "مصر", flag: "🇪🇬" },
    { name: "الأردن", flag: "🇯🇴" },
    { name: "لبنان", flag: "🇱🇧" },
    { name: "سوريا", flag: "🇸🇾" },
    { name: "العراق", flag: "🇮🇶" },
    { name: "اليمن", flag: "🇾🇪" },
    { name: "المغرب", flag: "🇲🇦" },
    { name: "الجزائر", flag: "🇩🇿" },
    { name: "تونس", flag: "🇹🇳" },
    { name: "ليبيا", flag: "🇱🇾" },
    { name: "السودان", flag: "🇸🇩" },
    { name: "فلسطين", flag: "🇵🇸" },
    { name: "باكستان", flag: "🇵🇰" },
    { name: "الهند", flag: "🇮🇳" },
    { name: "بنغلاديش", flag: "🇧🇩" },
    { name: "الفلبين", flag: "🇵🇭" },
    { name: "إندونيسيا", flag: "🇮🇩" },
    { name: "نيبال", flag: "🇳🇵" },
    { name: "أمريكا", flag: "🇺🇸" },
    { name: "بريطانيا", flag: "🇬🇧" },
    { name: "فرنسا", flag: "🇫🇷" },
    { name: "ألمانيا", flag: "🇩🇪" },
    { name: "إيطاليا", flag: "🇮🇹" },
    { name: "أسبانيا", flag: "🇪🇸" },
  ];

  useEffect(() => {
    fetchCustomers();
    fetchSettings();
    fetchPhoneTicketCounts();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("show_delete_customer_button")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.show_delete_customer_button !== undefined) {
      setShowDeleteButton(data.show_delete_customer_button);
    }
  };

  const fetchPhoneTicketCounts = async () => {
    try {
      // Fetch all ticket holders with confirmed orders to count by phone
      const { data, error } = await supabase
        .from("ticket_holders")
        .select(`
          phone,
          order_id,
          orders!inner (
            payment_status
          )
        `)
        .eq("orders.payment_status", "confirmed");

      if (error) throw error;

      // Count tickets per phone number
      const counts: Record<string, number> = {};
      (data || []).forEach((holder: any) => {
        const phone = holder.phone?.trim();
        if (phone) {
          counts[phone] = (counts[phone] || 0) + 1;
        }
      });

      setPhoneTicketCounts(counts);
    } catch (error) {
      console.error("Error fetching phone ticket counts:", error);
    }
  };

  // Generate QR codes for selected customer's ticket holders and orders
  useEffect(() => {
    const generateQRCodes = async () => {
      if (!selectedCustomer) {
        setQrCodes({});
        return;
      }

      const codes: Record<string, string> = {};
      for (const order of selectedCustomer.orders) {
        // Generate QR code for order
        if (order.qr_code) {
          try {
            const qrDataUrl = await QRCode.toDataURL(order.qr_code, {
              width: 200,
              margin: 2,
            });
            codes[order.qr_code] = qrDataUrl;
          } catch (error) {
            console.error("Error generating QR code:", error);
          }
        }
        
        // Generate QR codes for ticket holders
        if (order.ticket_holders) {
          for (const holder of order.ticket_holders) {
            if (holder.qr_code) {
              try {
                const qrDataUrl = await QRCode.toDataURL(holder.qr_code, {
                  width: 500,
                  margin: 2,
                });
                codes[holder.qr_code] = qrDataUrl;
              } catch (error) {
                console.error("Error generating QR code:", error);
              }
            }
          }
        }
      }
      setQrCodes(codes);
    };

    generateQRCodes();
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select(`
          *,
          orders (
            id,
            booking_reference,
            ticket_type,
            quantity,
            total_amount,
            payment_status,
            payment_method,
            created_at,
            qr_code,
            events (
              title,
              location,
              event_date,
              is_archived
            ),
            ticket_holders (
              id,
              name,
              phone,
              country_code,
              nationality,
              ticket_type,
              qr_code,
              is_present,
              id_number
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out customers with no orders and flatten event data
      // Only include confirmed orders
      const customersWithOrders = (data || []).filter(
        (customer) => customer.orders && customer.orders.length > 0
      ).map(customer => ({
        ...customer,
        orders: customer.orders
          .filter((order: any) => order.payment_status === 'confirmed') // Only confirmed orders
          .map((order: any) => ({
            ...order,
            event_title: order.events?.title || "",
            event_location: order.events?.location || "",
            event_date: order.events?.event_date || "",
            event_archived: order.events?.is_archived === true,
          }))
      })).filter(customer => customer.orders.length > 0); // Remove customers with no confirmed orders

      setCustomers(customersWithOrders);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  // Scope customers to the selected view (current season vs archived seasons)
  const scopedCustomers = customers
    .map((customer) => ({
      ...customer,
      orders: customer.orders.filter((order) =>
        view === "archived" ? order.event_archived : !order.event_archived
      ),
    }))
    .filter((customer) => customer.orders.length > 0);

  const filteredCustomers = scopedCustomers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm) ||
      // Search by order booking reference
      customer.orders.some(order => 
        order.booking_reference.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      // Search by ticket holder QR code
      customer.orders.some(order => 
        order.ticket_holders?.some(holder => 
          holder.qr_code?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
  );

  // Group customers into season "folders" (merging consecutive months), same as the events page
  const monthIndexOf = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getFullYear() * 12 + d.getMonth();
  };
  const monthNameOf = (idx: number) =>
    new Date(Math.floor(idx / 12), idx % 12, 1).toLocaleDateString("ar-u-nu-latn", { month: "long" });
  const monthYearOf = (idx: number) =>
    new Date(Math.floor(idx / 12), idx % 12, 1).toLocaleDateString("ar-u-nu-latn", {
      month: "long",
      year: "numeric",
    });

  const customerMonth = (customer: Customer) => {
    const indexes = customer.orders
      .map((o) => monthIndexOf(o.event_date))
      .filter((v): v is number => v !== null);
    return indexes.length ? Math.max(...indexes) : null;
  };

  const byMonth = new Map<number, Customer[]>();
  const undated: Customer[] = [];
  filteredCustomers.forEach((customer) => {
    const idx = customerMonth(customer);
    if (idx === null) undated.push(customer);
    else byMonth.set(idx, [...(byMonth.get(idx) ?? []), customer]);
  });

  const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => a - b);
  const customerGroups: { key: string; label: string; items: Customer[] }[] = [];
  let run: number[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    const items = run.flatMap((m) => byMonth.get(m) ?? []);
    const label =
      run.length === 1
        ? monthYearOf(run[0])
        : `${monthNameOf(run[0])} - ${monthYearOf(run[run.length - 1])}`;
    customerGroups.push({ key: `${run[0]}-${run[run.length - 1]}`, label, items });
    run = [];
  };
  sortedMonths.forEach((m) => {
    if (run.length === 0 || m === run[run.length - 1] + 1) run.push(m);
    else {
      flushRun();
      run.push(m);
    }
  });
  flushRun();
  if (undated.length) customerGroups.push({ key: "undated", label: "بدون تاريخ", items: undated });
  customerGroups.reverse();


  const sendInvoiceToWhatsApp = async (customer: Customer, orderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the customer dialog
    
    setSendingInvoice(orderId);
    
    try {
      // Find the order
      const order = customer.orders.find(o => o.id === orderId);
      if (!order || !order.ticket_holders || order.ticket_holders.length === 0) {
        toast.error("لم يتم العثور على التذاكر");
        return;
      }

      // Prepare arrays for QR codes and ticket types
      const qrCodeUrls: string[] = [];
      const ticketTypesArray: string[] = [];

      // Process each ticket holder to upload QR codes
      for (const holder of order.ticket_holders) {
        let qrCodeImageUrl = "";
        const qrDataUrl = qrCodes[holder.qr_code];
        
        if (qrDataUrl) {
          try {
            // Convert data URL to blob
            const response = await fetch(qrDataUrl);
            const blob = await response.blob();
            
            // Extract just the filename from holder.qr_code (in case it's a URL)
            let baseFileName = holder.qr_code;
            if (baseFileName.includes('/')) {
              // Extract filename from URL
              const parts = baseFileName.split('/');
              baseFileName = parts[parts.length - 1].replace('.png', '');
            }
            
            // Upload to storage
            const fileName = `${baseFileName}.png`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("qr-codes")
              .upload(fileName, blob, {
                contentType: "image/png",
                upsert: true,
              });

            if (uploadError) {
              console.error("Error uploading QR code:", uploadError);
            } else {
              // Get public URL
              const { data: urlData } = supabase.storage
                .from("qr-codes")
                .getPublicUrl(fileName);

              qrCodeImageUrl = urlData.publicUrl;
            }
          } catch (error) {
            console.error("Error processing QR code:", error);
          }
        }

        qrCodeUrls.push(qrCodeImageUrl);
        ticketTypesArray.push(holder.ticket_type);
      }

      // Prepare consolidated webhook payload
      const webhookPayload = {
        booking_reference: order.booking_reference,
        event_title: order.event_title || "",
        event_location: order.event_location || "",
        event_date: order.event_date || "",
        customer_name: customer.name,
        customer_phone: customer.phone.replace(/^\+\d+\s*/, '').trim(),
        customer_phone_whatsapp: `${order.ticket_holders[0]?.country_code?.replace('+', '') || '974'}${customer.phone.replace(/^\+\d+\s*/, '').trim()}`,
        nationality: customer.nationality || order.ticket_holders[0]?.nationality || "",
        quantity: order.quantity || order.ticket_holders.length,
        qr_codes: qrCodeUrls,
        ticket_types: ticketTypesArray,
        total_amount: order.total_amount || 0,
        payment_status: order.payment_status || "",
        timestamp: new Date().toISOString(),
      };

      console.log("Sending consolidated data to webhook:", webhookPayload);

      // Call the edge function once with all data
      const { error } = await supabase.functions.invoke("send-to-webhook", {
        body: webhookPayload,
      });

      if (error) {
        console.error("Failed to send tickets:", error);
        toast.error("فشل إرسال التذاكر");
      } else {
        toast.success(`تم إرسال ${order.ticket_holders.length} تذكرة إلى واتساب بنجاح`);
      }
    } catch (error) {
      console.error("Error sending tickets:", error);
      toast.error("فشل إرسال التذاكر. يرجى المحاولة مرة أخرى");
    } finally {
      setSendingInvoice(null);
    }
  };

  const sendTicketToWhatsApp = async (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the customer dialog
    
    // Get the latest order
    const latestOrder = customer.orders[0];
    if (!latestOrder) {
      toast.error("لا توجد حجوزات لهذا العميل");
      return;
    }

    setSendingTicket(customer.id);
    
    try {
      // Fetch webhook URL from settings
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("webhook_url, admin_phone")
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (!settings?.webhook_url) {
        toast.error("لم يتم تكوين رابط n8n webhook في الإعدادات");
        return;
      }

      // Fetch ticket prices
      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select("type, price");

      if (ticketsError) throw ticketsError;

      // Create a map of ticket type to price
      const ticketPrices = new Map(
        tickets?.map((ticket) => [ticket.type, ticket.price]) || []
      );

      // Generate QR codes for ticket holders with 500x500 size and upload to storage
      const holdersWithQrImages = await Promise.all(
        (latestOrder.ticket_holders || []).map(async (holder: any) => {
          let qrCodeImageUrl = null;
          if (holder.qr_code) {
            try {
              // Generate QR code as canvas
              const canvas = document.createElement('canvas');
              await QRCode.toCanvas(canvas, holder.qr_code, {
                width: 500,
                margin: 2,
              });
              
              // Convert canvas to blob (JPEG format)
              const blob = await new Promise<Blob>((resolve) => {
                canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95);
              });
              
              // Upload to storage
              const fileName = `${holder.id || Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('qr-codes')
                .upload(fileName, blob, {
                  contentType: 'image/jpeg',
                  cacheControl: '3600',
                  upsert: false
                });
              
              if (uploadError) {
                console.error("Error uploading QR code:", uploadError);
              } else {
                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                  .from('qr-codes')
                  .getPublicUrl(fileName);
                qrCodeImageUrl = publicUrl;
              }
            } catch (error) {
              console.error("Error generating QR code:", error);
            }
          }
          return {
            ...holder,
            qr_code_image: qrCodeImageUrl
          };
        })
      );

      // Send to n8n webhook
      console.log("Sending ticket via n8n webhook:", settings.webhook_url);
      // Numbers keep their own country code (the old rule put 974 in front of everyone's number)
      const formattedAdminPhone = toWhatsAppNumber(settings.admin_phone);
      const formatPhoneNumber = (phone: string | null | undefined, countryCode?: string | null) =>
        toWhatsAppNumber(phone, countryCode);

      const formattedCustomer = {
        name: customer.name,
        email: customer.email,
        phone: formatPhoneNumber(customer.phone, customer.country_code)
      };

      const formattedHolders = holdersWithQrImages.map((holder: any) => ({
        name: holder.name,
        phone: formatPhoneNumber(holder.phone, holder.country_code),
        nationality: holder.nationality,
        id_number: holder.id_number,
        ticket_type: holder.ticket_type,
        ticket_price: ticketPrices.get(holder.ticket_type) || 0,
        qr_code: holder.qr_code,
        qr_code_image: holder.qr_code_image // Public URL to .jpg image
      }));
      
      const response = await fetch(settings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: formattedCustomer,
          order: {
            id: latestOrder.id,
            booking_reference: latestOrder.booking_reference,
            ticket_type: latestOrder.ticket_type,
            quantity: latestOrder.quantity,
            total_amount: latestOrder.total_amount,
            payment_status: latestOrder.payment_status,
          },
          ticketHolders: formattedHolders,
          bookingReference: latestOrder.booking_reference,
          adminPhone: formattedAdminPhone,
          timestamp: new Date().toISOString(),
          action: "send_ticket", // To differentiate action type
        }),
      });

      if (!response.ok) {
        throw new Error("فشل إرسال التذكرة");
      }

      toast.success("تم إرسال التذكرة إلى واتساب بنجاح");
    } catch (error) {
      console.error("Error sending ticket:", error);
      toast.error("فشل إرسال التذكرة. يرجى المحاولة مرة أخرى");
    } finally {
      setSendingTicket(null);
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      nationality: customer.nationality || "قطر",
    });
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer) return;

    setSaving(true);
    try {
      // Update customer
      const { error } = await supabase
        .from("customers")
        .update({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          nationality: editForm.nationality,
        })
        .eq("id", editingCustomer.id);

      if (error) throw error;

      // Update ticket holders phone for all orders of this customer
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_id", editingCustomer.id);

      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        
        // Format phone with country code
        const formattedPhone = editForm.phone.startsWith('+') 
          ? editForm.phone 
          : `+974 ${editForm.phone}`;
        
        // Update all ticket holders for these orders
        const { error: ticketHoldersError } = await supabase
          .from("ticket_holders")
          .update({ phone: formattedPhone })
          .in("order_id", orderIds);

        if (ticketHoldersError) {
          console.error("Error updating ticket holders:", ticketHoldersError);
        }
      }

      toast.success("تم تحديث بيانات العميل بنجاح");
      setEditingCustomer(null);
      fetchCustomers();
      
      // Update selected customer if it's the same one
      if (selectedCustomer?.id === editingCustomer.id) {
        setSelectedCustomer({
          ...selectedCustomer,
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
        });
      }
    } catch (error) {
      console.error("Error updating customer:", error);
      toast.error("فشل تحديث بيانات العميل");
    } finally {
      setSaving(false);
    }
  };

  const toggleTicketPresence = async (ticketHolderId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("ticket_holders")
        .update({ is_present: !currentStatus })
        .eq("id", ticketHolderId);

      if (error) throw error;

      toast.success(
        !currentStatus ? "تم تحديد الحضور" : "تم إلغاء تحديد الحضور"
      );
      fetchCustomers();
      
      // Update selected customer if it's the same one
      if (selectedCustomer) {
        const updatedCustomer = {
          ...selectedCustomer,
          orders: selectedCustomer.orders.map(order => ({
            ...order,
            ticket_holders: order.ticket_holders?.map(holder =>
              holder.id === ticketHolderId
                ? { ...holder, is_present: !currentStatus }
                : holder
            ) || []
          }))
        };
        setSelectedCustomer(updatedCustomer);
      }
    } catch (error) {
      console.error("Error toggling ticket presence:", error);
      toast.error("فشل تحديث حالة الحضور");
    }
  };

  const handleEditTicketHolder = (holder: any) => {
    setEditingTicketHolder(holder.id);
    setTicketHolderEditForm({
      phone: holder.phone.replace(/^\+\d+\s*/, '').trim(),
      country_code: holder.country_code || '+974',
    });
  };

  const handleSaveTicketHolder = async () => {
    if (!editingTicketHolder) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("ticket_holders")
        .update({
          phone: ticketHolderEditForm.phone,
          country_code: ticketHolderEditForm.country_code,
        })
        .eq("id", editingTicketHolder);

      if (error) throw error;

      toast.success("تم تحديث بيانات حامل التذكرة بنجاح");
      setEditingTicketHolder(null);
      fetchCustomers();
      
      // Update selected customer if it's the same one
      if (selectedCustomer) {
        const updatedCustomer = {
          ...selectedCustomer,
          orders: selectedCustomer.orders.map(order => ({
            ...order,
            ticket_holders: order.ticket_holders?.map(holder =>
              holder.id === editingTicketHolder
                ? { ...holder, phone: ticketHolderEditForm.phone, country_code: ticketHolderEditForm.country_code }
                : holder
            ) || []
          }))
        };
        setSelectedCustomer(updatedCustomer);
      }
    } catch (error) {
      console.error("Error updating ticket holder:", error);
      toast.error("فشل تحديث بيانات حامل التذكرة");
    } finally {
      setSaving(false);
    }
  };

  const sendSingleTicketToWhatsApp = async (holder: any, orderRef: string) => {
    setSendingSingleTicket(holder.id);
    try {
      // Fetch webhook URL from settings
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("webhook_url")
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (!settings?.webhook_url) {
        toast.error("لم يتم تكوين رابط الويب هوك");
        return;
      }

      // Convert QR code data URL to blob and upload to storage
      let qrCodeImageUrl = "";
      const qrDataUrl = qrCodes[holder.qr_code];
      
      if (qrDataUrl) {
        try {
          // Convert data URL to blob
          const response = await fetch(qrDataUrl);
          const blob = await response.blob();
          
          // Upload to storage
          const fileName = `${holder.qr_code}.png`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("qr-codes")
            .upload(fileName, blob, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("qr-codes")
            .getPublicUrl(fileName);

          qrCodeImageUrl = urlData.publicUrl;
        } catch (error) {
          console.error("Error uploading QR code:", error);
          toast.error("فشل رفع رمز QR");
          return;
        }
      }

      // Fetch ticket price
      const { data: tickets } = await supabase
        .from("tickets")
        .select("type, price");

      const ticketPrices = new Map<string, number>(
        tickets?.map((ticket) => [ticket.type as string, ticket.price as number]) || []
      );

      // Get order details
      const order = selectedCustomer?.orders.find(o => o.booking_reference === orderRef);
      if (!order) {
        toast.error("لم يتم العثور على الطلب");
        return;
      }

      // Prepare ticket data
      const ticketData = {
        booking_reference: orderRef,
        event_title: order.event_title || "",
        event_location: order.event_location || "",
        event_date: order.event_date || "",
        ticket_count: 1,
        holder: {
          name: holder.name,
          phone: holder.phone.replace(/^\+\d+\s*/, '').trim(),
          // the number's own "+code" is the truth (old records stored +974 for everyone)
          country_code: /^\s*\+(\d{1,4})\s/.exec(holder.phone)?.[1] ?? (holder.country_code?.replace('+', '') || '974'),
          nationality: holder.nationality,
          id_number: holder.id_number,
          ticket_type: holder.ticket_type,
          ticket_price: ticketPrices.get(holder.ticket_type as string) || 0,
          qr_code: holder.qr_code,
          qr_code_image: qrCodeImageUrl,
          is_present: holder.is_present
        },
        timestamp: new Date().toISOString()
      };

      // Send to webhook via edge function
      const { data, error: webhookError } = await supabase.functions.invoke('send-to-webhook', {
        body: ticketData
      });

      if (webhookError) {
        console.error("Webhook error:", webhookError);
        throw new Error(webhookError.message || "فشل الاتصال بالويب هوك");
      }

      if (data && data.error) {
        console.error("Webhook response error:", data);
        const detailsMessage = typeof data.details === 'object' ? data.details.message : data.details;
        if (detailsMessage && detailsMessage.includes('not registered')) {
          throw new Error("الويب هوك غير مفعل في n8n. يرجى تفعيل الـ workflow أولاً");
        }
        throw new Error(data.error || "فشل إرسال البيانات إلى الويب هوك");
      }

      if (data && data.success) {
        toast.success(`تم إرسال التذكرة إلى ${holder.phone}`);
      } else {
        throw new Error("استجابة غير متوقعة من الويب هوك");
      }
    } catch (error) {
      console.error("Error sending ticket:", error);
      const errorMessage = error instanceof Error ? error.message : "فشل إرسال التذكرة";
      toast.error(errorMessage);
    } finally {
      setSendingSingleTicket(null);
    }
  };

  const handleDeleteCustomer = async (customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm("هل أنت متأكد من حذف هذا العميل وجميع حجوزاته وتذاكره؟ لا يمكن التراجع عن هذا الإجراء.")) {
      return;
    }

    try {
      // First, delete all ticket holders for all orders of this customer
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_id", customerId);

      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        
        // Delete ticket holders
        const { error: ticketHoldersError } = await supabase
          .from("ticket_holders")
          .delete()
          .in("order_id", orderIds);

        if (ticketHoldersError) throw ticketHoldersError;
      }

      // Delete all orders for this customer
      const { error: ordersError } = await supabase
        .from("orders")
        .delete()
        .eq("customer_id", customerId);

      if (ordersError) throw ordersError;

      // Finally, delete the customer
      const { error: customerError } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);

      if (customerError) throw customerError;

      toast.success("تم حذف العميل وجميع حجوزاته بنجاح");
      fetchCustomers();
      
      // Close dialog if this customer was selected
      if (selectedCustomer?.id === customerId) {
        setSelectedCustomer(null);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("فشل حذف العميل. يرجى المحاولة مرة أخرى");
    }
  };

  const handleReturnTicket = async (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`هل أنت متأكد من إرجاع التذكرة للطلب ${order.booking_reference}؟ سيتم إعادة التذكرة للبيع مرة أخرى.`)) {
      return;
    }

    try {
      // One atomic server-side step: cancels the order and puts exactly the seats it
      // held (per ticket type) back on sale. Safe to click twice.
      const result = await api.cancelOrder(order.id, "returned by admin");
      if (result.ok === false) throw new Error(result.error.message);
      if (result.data.result === "already_inactive") {
        toast.info("هذا الطلب ملغي مسبقاً");
        fetchCustomers();
        return;
      }

      toast.success("تم إرجاع التذكرة وإعادتها للبيع بنجاح");
      fetchCustomers();
      
      // Update selected customer if needed
      if (selectedCustomer) {
        const updatedOrders = selectedCustomer.orders.map(o => 
          o.id === order.id ? { ...o, payment_status: 'cancelled' } : o
        );
        setSelectedCustomer({
          ...selectedCustomer,
          orders: updatedOrders
        });
      }
    } catch (error) {
      console.error("Error returning ticket:", error);
      toast.error("فشل إرجاع التذكرة. يرجى المحاولة مرة أخرى");
    }
  };

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold font-lusail">العملاء والحجوزات</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-1 bg-muted/40">
            <Button
              variant={view === "current" ? "default" : "ghost"}
              size="sm"
              className="font-lusail"
              onClick={() => setView("current")}
            >
              الحالية
            </Button>
            <Button
              variant={view === "archived" ? "default" : "ghost"}
              size="sm"
              className="font-lusail gap-1"
              onClick={() => setView("archived")}
            >
              <Archive className="w-4 h-4" />
              الأرشيف
            </Button>
          </div>
          <Input
            placeholder="بحث بالاسم، الهاتف، أو رمز التذكرة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm font-lusail"
          />
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground font-lusail">لا يوجد عملاء مع حجوزات</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {customerGroups.map((group) => (
          <Collapsible key={group.key} defaultOpen={view === "current" || customerGroups.length === 1}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-right transition-colors hover:bg-muted/50 [&[data-state=open]>div>svg.chevron]:rotate-180">
              <div className="flex items-center gap-3">
                <Folder className="h-5 w-5 text-primary" />
                <span className="font-lusail text-lg font-bold">{group.label}</span>
                <Badge variant="secondary" className="font-lusail">
                  {group.items.length} عميل
                </Badge>
                <ChevronDown className="chevron h-4 w-4 text-muted-foreground transition-transform" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr pt-4">
          {group.items.map((customer) => {
            // Collect all ticket holders from all orders with their details
            const allTickets = customer.orders.flatMap(order => 
              order.ticket_holders?.map(holder => ({
                name: holder.name,
                ticketType: holder.ticket_type,
                phone: holder.phone,
                nationality: holder.nationality,
                orderRef: order.booking_reference,
                idNumber: holder.id_number,
                paymentMethod: order.payment_method
              })) || []
            );

            // Calculate total tickets and payment method
            const totalTicketCount = allTickets.length;
            const paymentMethod = customer.orders[0]?.payment_method;

            // Separate main ticket (first) from secondary tickets (rest)
            const mainTicket = allTickets[0];
            const secondaryTickets = allTickets.slice(1);

            return (
              <Card
                key={customer.id}
                className="hover:shadow-lg transition-shadow cursor-pointer flex flex-col h-full overflow-hidden relative"
                onClick={() => setSelectedCustomer(customer)}
              >
                {/* Event Name Header */}
                {customer.orders[0]?.event_title && (
                  <div className="bg-primary text-primary-foreground px-4 py-2 text-center relative">
                    {/* Repeat ticket count badge */}
                    {phoneTicketCounts[customer.phone] > 1 && (
                      <div className="absolute top-1/2 -translate-y-1/2 left-2 bg-primary-foreground text-primary text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md">
                        {phoneTicketCounts[customer.phone]}
                      </div>
                    )}
                    <span className="text-sm font-bold font-lusail">{customer.orders[0].event_title}</span>
                  </div>
                )}
                
                <div className="p-4 flex flex-col flex-1">
                <div className="flex flex-col space-y-3 flex-1">

                  {/* Customer Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    {mainTicket && (
                      <div className="flex-1 text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Badge variant={paymentMethod === 'cash_pos' ? 'secondary' : 'default'} className="text-[10px] px-1.5 py-0.5">
                            {paymentMethod === 'cash_pos' ? 'POS' : 'Online'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            {totalTicketCount} تذكرة
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-lusail">رمز التذكرة:</p>
                        <p className="text-[10px] font-bold font-mono text-primary">{mainTicket.orderRef}</p>
                      </div>
                    )}
                    <div className="flex-1 text-right">
                      <h3 className="font-bold font-lusail text-sm">{customer.name}</h3>
                      <p className="text-xs text-muted-foreground font-lusail">
                        {customer.phone}
                      </p>
                    </div>
                  </div>

                  {/* Main Ticket */}
                  {mainTicket && (
                    <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Ticket className="w-4 h-4 text-primary" />
                        <span className="text-xs font-semibold font-lusail">التذكرة الرئيسية:</span>
                      </div>
                      <div className="bg-background border border-border/50 rounded-lg p-3 text-right shadow-sm">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {mainTicket.ticketType.toUpperCase()}
                            </Badge>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium font-lusail">
                                {mainTicket.name}
                              </span>
                              <span className="text-lg leading-none">{getCountryFlag(mainTicket.nationality)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            {mainTicket.idNumber && (
                              <div className="flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                <span className="font-lusail">{mainTicket.idNumber}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <span className="font-lusail">{mainTicket.phone}</span>
                              <Phone className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Secondary Tickets */}
                  {secondaryTickets.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Ticket className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-semibold font-lusail">التذاكر الإضافية:</span>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {secondaryTickets.map((ticket, idx) => (
                          <div
                            key={idx}
                            className="bg-background border border-border/50 rounded-lg p-3 text-right shadow-sm"
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-xs">
                                  {ticket.ticketType.toUpperCase()}
                                </Badge>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium font-lusail">
                                    {ticket.name}
                                  </span>
                                  <span className="text-lg leading-none">{getCountryFlag(ticket.nationality)}</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                {ticket.idNumber && (
                                  <div className="flex items-center gap-1">
                                    <CreditCard className="w-3 h-3" />
                                    <span className="font-lusail">{ticket.idNumber}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <span className="font-lusail">{ticket.phone}</span>
                                  <Phone className="w-3 h-3" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </div>

                {/* Action Buttons - Outside the flex-1 container */}
                <div className="flex gap-2 pt-4 border-t border-border/30 px-4 pb-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => sendTicketToWhatsApp(customer, e)}
                    disabled={sendingTicket === customer.id}
                    className="flex-1"
                    title="إرسال التذكرة عبر n8n"
                  >
                    {sendingTicket === customer.id ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <>
                        <Ticket className="w-3.5 h-3.5 ml-1" />
                        <span className="text-xs">إرسال التذكرة</span>
                      </>
                    )}
                  </Button>
                  {showDeleteButton && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => handleDeleteCustomer(customer.id, e)}
                      className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="حذف العميل وجميع حجوزاته"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
              </div>
            </CollapsibleContent>
          </Collapsible>
          ))}
        </div>
      )}

      {/* Customer Details Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-lusail text-2xl">تفاصيل العميل</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
              {/* Customer Info */}
              <Card className="p-4 bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="font-bold text-lg font-lusail">{selectedCustomer.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      <span className="font-lusail">{selectedCustomer.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span className="font-lusail">{selectedCustomer.phone}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditCustomer(selectedCustomer)}
                  >
                    <Edit className="w-4 h-4 ml-1" />
                    <span className="font-lusail">تعديل</span>
                  </Button>
                </div>
              </Card>

              {/* Orders */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg font-lusail">الحجوزات</h3>
                {selectedCustomer.orders.map((order) => (
                  <Card key={order.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Calendar className="w-4 h-4 text-primary" />
                            <span className="font-semibold font-lusail">
                              {order.booking_reference}
                            </span>
                            <Badge
                              variant={
                                order.payment_status === "confirmed"
                                  ? "default"
                                  : order.payment_status === "pending"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="font-lusail"
                            >
                              {order.payment_status === "confirmed"
                                ? "مؤكد"
                                : order.payment_status === "pending"
                                ? "قيد الانتظار"
                                : "ملغي"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => handleReturnTicket(order, e)}
                              title="إرجاع التذكرة وإعادتها للبيع"
                            >
                              <Trash2 className="w-4 h-4 ml-1" />
                              <span>إرجاع التذكرة</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => sendInvoiceToWhatsApp(selectedCustomer, order.id, e)}
                              disabled={sendingInvoice === order.id}
                              title="إرسال الفاتورة عبر واتساب"
                            >
                              {sendingInvoice === order.id ? (
                                <span className="animate-spin">⏳</span>
                              ) : (
                                <MessageCircle className="w-4 h-4 text-green-600" />
                              )}
                            </Button>
                          {order.qr_code && qrCodes[order.qr_code] && (
                            <div className="flex-shrink-0 bg-white p-2 rounded">
                              <img
                                src={qrCodes[order.qr_code]}
                                alt={`QR Code for ${order.booking_reference}`}
                                className="w-[200px] h-[200px]"
                                style={{ display: 'block' }}
                              />
                            </div>
                          )}
                          <div className="text-left">
                            <div className="font-bold text-primary font-lusail">
                              {parseFloat(order.total_amount.toString()).toFixed(2)} {t("qar")}
                            </div>
                            <div className="text-sm text-muted-foreground font-lusail">
                              {order.quantity} تذكرة
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Ticket Holders */}
                      {order.ticket_holders && order.ticket_holders.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-2 mb-2">
                            <Ticket className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold font-lusail">
                              حاملو التذاكر:
                            </span>
                          </div>
                          <div className="grid gap-4">
                            {order.ticket_holders.map((holder, idx) => (
                              <div
                                key={idx}
                                className="bg-muted/30 rounded p-4 text-sm font-lusail"
                              >
                                {editingTicketHolder === holder.id ? (
                                  // Edit Mode
                                  <div className="space-y-3">
                                    <div className="flex justify-between items-center mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{holder.name}</span>
                                        {holder.is_present && (
                                          <Badge variant="default" className="text-xs bg-green-500">
                                            حاضر
                                          </Badge>
                                        )}
                                      </div>
                                      <Badge variant="outline" className="text-xs">
                                        {holder.ticket_type.toUpperCase()}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-xs font-medium block mb-1">كود الدولة</label>
                                        <Input
                                          value={ticketHolderEditForm.country_code}
                                          onChange={(e) => setTicketHolderEditForm({ ...ticketHolderEditForm, country_code: e.target.value })}
                                          placeholder="+974"
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-medium block mb-1">رقم الهاتف</label>
                                        <Input
                                          value={ticketHolderEditForm.phone}
                                          onChange={(e) => setTicketHolderEditForm({ ...ticketHolderEditForm, phone: e.target.value })}
                                          placeholder="XXXX XXXX"
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingTicketHolder(null)}
                                        disabled={saving}
                                      >
                                        إلغاء
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={handleSaveTicketHolder}
                                        disabled={saving}
                                      >
                                        {saving ? "جاري الحفظ..." : "حفظ"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  // View Mode
                                  <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                      <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{holder.name}</span>
                                          {holder.is_present && (
                                            <Badge variant="default" className="text-xs bg-green-500">
                                              حاضر
                                            </Badge>
                                          )}
                                        </div>
                                        <Badge variant="outline" className="text-xs">
                                          {holder.ticket_type.toUpperCase()}
                                        </Badge>
                                      </div>
                                      <div className="text-xs text-muted-foreground space-y-1">
                                        <div className="flex items-center justify-center gap-2" dir="ltr">
                                          <span>{(holder.country_code || '+974')}{holder.phone}</span>
                                          <span>•</span>
                                          <span>{holder.nationality}</span>
                                        </div>
                                        {holder.id_number && (
                                          <div className="flex items-center gap-1">
                                            <CreditCard className="w-3 h-3" />
                                            <span>{holder.id_number}</span>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-2">
                                          <span className="font-medium">حالة التأكيد:</span>
                                          {order.payment_status === "confirmed" ? (
                                            <Badge variant="default" className="text-xs bg-green-600">
                                              ✓ مؤكد
                                            </Badge>
                                          ) : order.payment_status === "pending" ? (
                                            <Badge variant="secondary" className="text-xs">
                                              ⏳ قيد الانتظار
                                            </Badge>
                                          ) : (
                                            <Badge variant="destructive" className="text-xs">
                                              ✗ ملغي
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEditTicketHolder(holder)}
                                        className="flex-shrink-0"
                                        title="تعديل رقم الهاتف"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      {order.payment_status !== "pending" && (
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => sendSingleTicketToWhatsApp(holder, order.booking_reference)}
                                          disabled={sendingSingleTicket === holder.id}
                                          className="flex-shrink-0"
                                          title="إرسال التذكرة للواتساب"
                                        >
                                          {sendingSingleTicket === holder.id ? (
                                            <span className="animate-spin">⏳</span>
                                          ) : (
                                            <Send className="w-4 h-4" />
                                          )}
                                        </Button>
                                      )}
                                      {holder.is_present && (
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          onClick={() => toggleTicketPresence(holder.id, holder.is_present)}
                                          className="flex-shrink-0"
                                          title="إلغاء تحديد الحضور"
                                        >
                                          <UserX className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground font-lusail">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Viewer Dialog */}
      <Dialog open={!!viewingQrCode} onOpenChange={() => setViewingQrCode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-lusail text-xl">
              QR Code - {viewingQrCode?.name}
            </DialogTitle>
          </DialogHeader>
          {viewingQrCode && (
            <div className="space-y-4">
              <div className="flex justify-center p-4">
                <img
                  src={viewingQrCode.code}
                  alt={`QR Code for ${viewingQrCode.name}`}
                  className="w-full max-w-[400px] h-auto"
                />
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2 font-lusail">QR Code Value:</p>
                <p className="font-mono text-xs break-all bg-background p-2 rounded border">
                  {viewingQrCode.reference}
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-lusail">
                  This is the value encoded in the QR code. It should match what the scanner reads.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={() => setEditingCustomer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-lusail text-xl">تعديل بيانات العميل</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium font-lusail block mb-2">الاسم</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="اسم العميل"
                className="font-lusail"
              />
            </div>

            <div>
              <label className="text-sm font-medium font-lusail block mb-2">البريد الإلكتروني</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="email@example.com"
                className="font-lusail"
              />
            </div>

            <div>
              <label className="text-sm font-medium font-lusail block mb-2">رقم الهاتف</label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+974 XXXX XXXX"
                className="font-lusail"
              />
            </div>

            <div>
              <label className="text-sm font-medium font-lusail block mb-2">الجنسية</label>
              <Select
                value={editForm.nationality}
                onValueChange={(value) => setEditForm({ ...editForm, nationality: value })}
              >
                <SelectTrigger className="font-lusail">
                  <SelectValue placeholder="اختر الجنسية" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {gulfNationalities.map((nat) => (
                    <SelectItem key={nat.name} value={nat.name}>
                      {nat.flag} {nat.name}
                    </SelectItem>
                  ))}
                  {otherNationalities.map((nat) => (
                    <SelectItem key={nat.name} value={nat.name}>
                      {nat.flag} {nat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingCustomer(null)}
                disabled={saving}
                className="font-lusail"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSaveCustomer}
                disabled={saving}
                className="font-lusail"
              >
                {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
