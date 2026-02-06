import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Loader2, CheckCircle, Clock, RotateCcw, CalendarX, PauseCircle, FileDown, Mail } from "lucide-react";
import { generateInvoicePdf } from "@/lib/generateInvoicePdf";
import { useSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { isEventExpired } from "@/lib/eventUtils";

const COUNTRY_FLAGS: Record<string, string> = {
  "السعودية": "🇸🇦",
  "الإمارات": "🇦🇪",
  "قطر": "🇶🇦",
  "الكويت": "🇰🇼",
  "البحرين": "🇧🇭",
  "عمان": "🇴🇲",
  "مصر": "🇪🇬",
  "الأردن": "🇯🇴",
  "لبنان": "🇱🇧",
  "العراق": "🇮🇶",
  "سوريا": "🇸🇾",
  "اليمن": "🇾🇪",
  "ليبيا": "🇱🇾",
  "السودان": "🇸🇩",
  "الجزائر": "🇩🇿",
  "المغرب": "🇲🇦",
  "تونس": "🇹🇳",
  "موريتانيا": "🇲🇷",
  "الصومال": "🇸🇴",
  "جيبوتي": "🇩🇯",
  "فلسطين": "🇵🇸"
};

interface Order {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  qr_code: string | null;
  n8n_response_message: string | null;
  n8n_responded_at: string | null;
  send_attempt_count: number | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    country_code: string;
    nationality: string | null;
  };
  events?: {
    title: string;
    event_date: string;
    location: string;
  };
  ticket_holders?: Array<{
    qr_code: string | null;
    ticket_type: string;
  }>;
}

export const InvoiceTab = () => {
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentOrders, setSentOrders] = useState<Map<string, { sentAt: Date; message?: string }>>(new Map());
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [currentlySending, setCurrentlySending] = useState<string | null>(null);
  const [autoInvoiceInterval, setAutoInvoiceInterval] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);
  const [isCountdownActive, setIsCountdownActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('invoiceCountdownActive');
      console.log('Loading countdown state from localStorage:', saved);
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [batchMin, setBatchMin] = useState<number>(1);
  const [batchMax, setBatchMax] = useState<number>(10);
  const [delayMin, setDelayMin] = useState<number>(300);
  const [delayMax, setDelayMax] = useState<number>(600);
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "sent" | "eventDone" | "onHold">("all");
  const [sendingIndividual, setSendingIndividual] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    fetchWebhookUrl();
    fetchAutoInvoiceInterval();
    fetchBatchSettings();
    fetchDelaySettings();

    // Subscribe to realtime updates for n8n responses
    const channel = supabase
      .channel('orders-n8n-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: 'payment_method=eq.sadad'
        },
        (payload) => {
          console.log('Order updated:', payload);
          // Refresh orders when n8n responds
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Persist countdown state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('invoiceCountdownActive', isCountdownActive.toString());
      console.log('Saved countdown state to localStorage:', isCountdownActive);
    } catch (e) {
      console.error('Failed to save countdown state:', e);
    }
  }, [isCountdownActive]);

  // Check if an order is truly sent (n8n responded with success, not just "sending" status)
  const isPendingMessage = (message: string | null) => {
    if (!message) return true;
    // If message indicates still sending, treat as pending
    return message === 'جاري الإرسال إلى واتساب...';
  };

  // Check if event date has passed (past 6 PM Qatar time on event day)
  const isEventDone = (order: Order) => {
    if (!order.events?.event_date) return false;
    return isEventExpired(order.events.event_date);
  };

  // Check if order is on hold (2+ failed send attempts without success)
  const isOnHold = (order: Order) => {
    const attemptCount = order.send_attempt_count || 0;
    const isPending = isPendingMessage(order.n8n_response_message) || !order.n8n_responded_at;
    return attemptCount >= 2 && isPending;
  };

  // Calculate pending orders count - orders that are truly pending AND event not done AND not on hold
  const pendingOrdersCount = orders.filter(o => 
    (isPendingMessage(o.n8n_response_message) || !o.n8n_responded_at) && !isEventDone(o) && !isOnHold(o)
  ).length;
  
  // Calculate sent orders count - orders that have actual success response
  const sentOrdersCount = orders.filter(o => !isPendingMessage(o.n8n_response_message) && !!o.n8n_responded_at).length;

  // Calculate event done orders count - orders where event has passed but invoice wasn't sent
  const eventDoneOrdersCount = orders.filter(o => 
    isEventDone(o) && (isPendingMessage(o.n8n_response_message) || !o.n8n_responded_at)
  ).length;

  // Calculate on hold orders count - orders with 2+ failed attempts
  const onHoldOrdersCount = orders.filter(o => isOnHold(o) && !isEventDone(o)).length;

  // Auto-start countdown when page loads if there are pending orders and countdown was previously active
  useEffect(() => {
    if (pendingOrdersCount > 0 && !isCountdownActive && !sending) {
      // Check if countdown was previously active in localStorage
      const wasActive = localStorage.getItem('invoiceCountdownActive') === 'true';
      if (wasActive) {
        console.log('Auto-restarting countdown - pending orders exist and was previously active');
        setIsCountdownActive(true);
        setCountdown(autoInvoiceInterval);
      }
    }
  }, [pendingOrdersCount, autoInvoiceInterval]); // Only run when orders are loaded

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    // Only run countdown if there are pending orders
    const hasPendingOrders = pendingOrdersCount > 0;
    
    if (isCountdownActive && countdown > 0 && !sending && hasPendingOrders) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0 && isCountdownActive && !sending && hasPendingOrders) {
      // Countdown reached 0, send invoices automatically
      sendInvoices();
      setCountdown(autoInvoiceInterval);
    }

    return () => clearTimeout(timer);
  }, [countdown, isCountdownActive, sending, pendingOrdersCount]);

  // Auto-restart countdown when pending orders appear
  useEffect(() => {
    if (isCountdownActive && pendingOrdersCount > 0 && countdown === 0) {
      setCountdown(autoInvoiceInterval);
    }
  }, [pendingOrdersCount, isCountdownActive, autoInvoiceInterval]);

  const fetchWebhookUrl = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("webhook_url")
      .maybeSingle();

    if (error) {
      console.error("Error fetching webhook URL:", error);
      return;
    }

    setWebhookUrl(data?.webhook_url || null);
  };

  const fetchAutoInvoiceInterval = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("auto_invoice_interval_seconds")
      .maybeSingle();

    if (error) {
      console.error("Error fetching auto invoice interval:", error);
      return;
    }

    const interval = data?.auto_invoice_interval_seconds || 60;
    setAutoInvoiceInterval(interval);
    setCountdown(interval);
  };

  const fetchBatchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("invoice_batch_min, invoice_batch_max")
      .maybeSingle();

    if (error) {
      console.error("Error fetching batch settings:", error);
      return;
    }

    setBatchMin(data?.invoice_batch_min || 1);
    setBatchMax(data?.invoice_batch_max || 10);
  };

  const fetchDelaySettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("invoice_send_delay_min, invoice_send_delay_max")
      .maybeSingle();

    if (error) {
      console.error("Error fetching delay settings:", error);
      return;
    }

    setDelayMin(data?.invoice_send_delay_min || 300);
    setDelayMax(data?.invoice_send_delay_max || 600);
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, email, phone, country_code, nationality), events(title, event_date, location), ticket_holders(qr_code, ticket_type)")
        .eq("payment_method", "sadad")
        .eq("payment_status", "confirmed")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Filter out orders from November 6, 7, 8, 2025
      const filteredData = (data || []).filter(order => {
        const orderDate = new Date(order.created_at);
        const year = orderDate.getFullYear();
        const month = orderDate.getMonth(); // 0-indexed (10 = November)
        const day = orderDate.getDate();
        
        // Exclude November 6, 7, 8, 2025
        if (year === 2025 && month === 10) {
          if (day === 6 || day === 7 || day === 8) {
            return false;
          }
        }
        return true;
      });
      
      setOrders(filteredData);
    } catch (error) {
      console.error("Failed to load orders:", error);
      toast.error("فشل في تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  };

  const sendInvoiceToWebhook = async (order: Order, totalQuantity: number): Promise<{ success: boolean; message: string }> => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return { success: false, message: "لم يتم تكوين رابط الويب هوك" };
    }

    try {
      // Construct full phone number with country code (without +) for WhatsApp
      const countryCode = order.customers.country_code?.replace('+', '') || '974';
      const fullPhone = `${countryCode}${order.customers.phone}`;

      // Extract all ticket holder QR codes and ticket types
      // Convert QR codes to full URLs if they're not already
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const ticketQrCodes = order.ticket_holders?.map(holder => {
        if (!holder.qr_code) return null;
        // If it's already a full URL, return it as is
        if (holder.qr_code.startsWith('http')) {
          return holder.qr_code;
        }
        // Otherwise, construct the full URL
        return `${supabaseUrl}/storage/v1/object/public/qr-codes/${holder.qr_code}.png`;
      }).filter(Boolean) || [];
      const ticketTypes = order.ticket_holders?.map(holder => holder.ticket_type) || [];

      const payload = {
        order_id: order.id, // Include order ID for immediate database update
        booking_reference: order.booking_reference,
        customer_name: order.customers.name,
        customer_phone: order.customers.phone,
        customer_phone_whatsapp: fullPhone,
        customer_email: order.customers.email,
        nationality: order.customers.nationality,
        ticket_type: order.ticket_type,
        quantity: order.quantity,
        total_quantity: totalQuantity,
        total_amount: order.total_amount,
        payment_status: order.payment_status,
        qr_codes: ticketQrCodes,
        ticket_types: ticketTypes,
        event_title: order.events?.title,
        event_date: order.events?.event_date,
        event_location: order.events?.location,
        created_at: order.created_at,
        customers: order.customers,
      };

      // Use edge function to avoid CORS issues
      const { data, error } = await supabase.functions.invoke('send-to-webhook', {
        body: payload,
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error(`خطأ في الاتصال: ${error.message}`);
        return { success: false, message: error.message };
      }

      // Handle response from edge function
      if (data?.error) {
        console.error("Webhook error:", data);

        const status = (data as any)?.status as number | undefined;
        const details = (data as any)?.details as { hint?: string; message?: string } | undefined;
        const solution = (data as any)?.solution as string | undefined;

        let errorMessage = (data as any)?.error || "فشل الإرسال";

        if (status === 404) {
          // n8n commonly returns 404 when the workflow is not activated or when using a test webhook
          errorMessage = "Webhook غير موجود أو غير مفعل في n8n. فعّل الـ workflow (Activate) أو اضغط Execute workflow إذا كنت تستخدم Test Webhook.";
        } else if (details?.hint) {
          errorMessage = `${errorMessage} — ${details.hint}`;
        } else if (solution) {
          errorMessage = `${errorMessage} — ${solution}`;
        }

        toast.error(`خطأ من n8n: ${errorMessage}`);
        return { success: false, message: errorMessage };
      }

      // Handle successful response
      console.log("Webhook response:", data);
      const message = data?.message || "تم الإرسال بنجاح";
      return { success: true, message };
    } catch (error) {
      console.error("Error sending to webhook:", error);
      const errorMessage = error instanceof Error ? error.message : 'خطأ غير معروف';
      toast.error(`خطأ في الاتصال بـ n8n: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  };

  const sendInvoices = async (shouldRestartCountdown: boolean = true) => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return;
    }

    setSending(true);
    const newSentOrders = new Map(sentOrders);

    // Filter orders that need to be sent (only those that are truly pending AND event not done AND not on hold)
    const allOrdersToSend = orders.filter(
      order => !sentOrders.has(order.id) && isPendingMessage(order.n8n_response_message) && !isEventDone(order) && !isOnHold(order)
    );

    if (allOrdersToSend.length === 0) {
      setSending(false);
      if (shouldRestartCountdown && isCountdownActive) {
        setCountdown(autoInvoiceInterval);
      }
      toast.info("جميع الطلبات تم إرسالها بالفعل");
      return;
    }

    // Limit to batch size range (between batchMin and batchMax)
    const batchSize = Math.min(batchMax, Math.max(batchMin, allOrdersToSend.length));
    const ordersToSend = allOrdersToSend.slice(0, batchSize);

    toast.info(`سيتم إرسال ${ordersToSend.length} فاتورة من أصل ${allOrdersToSend.length}`);

    // Calculate total quantity of all tickets being sent
    const totalQuantity = ordersToSend.reduce((sum, order) => sum + order.quantity, 0);

    for (let i = 0; i < ordersToSend.length; i++) {
      const order = ordersToSend[i];

      setCurrentlySending(order.id);
      toast.info(`إرسال فاتورة ${i + 1} من ${ordersToSend.length}...`);
      
      // Increment send attempt count BEFORE sending (to track all attempts)
      const currentAttempts = order.send_attempt_count || 0;
      const newAttempts = currentAttempts + 1;
      
      // Update attempt count in database before sending
      await supabase
        .from("orders")
        .update({ send_attempt_count: newAttempts })
        .eq("id", order.id);
      
      const result = await sendInvoiceToWebhook(order, totalQuantity);
      
      if (result.success) {
        // Check if the response message indicates actual success (not just "in progress")
        const isActualSuccess = result.message && 
          !result.message.includes('جاري الإرسال') && 
          (result.message.includes('تم إرسال') || result.message.includes('بنجاح'));
        
        if (isActualSuccess) {
          // Reset attempt count on actual success
          await supabase
            .from("orders")
            .update({ send_attempt_count: 0 })
            .eq("id", order.id);
        }
        
        const sentTime = new Date();
        newSentOrders.set(order.id, { sentAt: sentTime, message: result.message });
        setSentOrders(new Map(newSentOrders));
        
        if (newAttempts >= 2 && !isActualSuccess) {
          toast.warning(`الفاتورة لـ ${order.customers.name} - المحاولة ${newAttempts} (ستوضع في الانتظار إذا لم تنجح)`);
        } else {
          toast.success(`تم إرسال الفاتورة لـ ${order.customers.name}`);
        }
      } else {
        newSentOrders.set(order.id, { sentAt: new Date(), message: result.message });
        setSentOrders(new Map(newSentOrders));
        
        if (newAttempts >= 2) {
          toast.error(`فشل إرسال الفاتورة لـ ${order.customers.name} - تم وضعها في الانتظار (محاولة ${newAttempts})`);
        } else {
          toast.error(`فشل إرسال الفاتورة لـ ${order.customers.name} (محاولة ${newAttempts} من 2)`);
        }
      }

      setCurrentlySending(null);

      // Only wait if there are more orders to send
      if (i < ordersToSend.length - 1) {
        const minDelayMs = delayMin * 1000; // Convert seconds to milliseconds
        const maxDelayMs = delayMax * 1000;
        const randomDelay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
        const delaySeconds = Math.round(randomDelay / 1000);
        toast.info(`انتظار ${delaySeconds} ثانية قبل إرسال الفاتورة التالية...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
    }

    setSending(false);
    setCurrentlySending(null);
    
    // Restart countdown if it was active (auto-send mode)
    if (shouldRestartCountdown && isCountdownActive) {
      setCountdown(autoInvoiceInterval);
    }
    
    toast.success("تم الانتهاء من إرسال جميع الفواتير!");
  };

  const startCountdown = () => {
    setCountdown(autoInvoiceInterval);
    setIsCountdownActive(true);
    toast.info(`بدأ العد التنازلي - ${autoInvoiceInterval} ثانية`);
  };

  const stopCountdown = () => {
    setIsCountdownActive(false);
    setCountdown(autoInvoiceInterval);
    toast.info("تم إيقاف العد التنازلي");
  };

  const resetOrderStatus = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          n8n_response_message: null,
          n8n_responded_at: null,
        })
        .eq("id", orderId);

      if (error) throw error;

      // Remove from sentOrders state
      const newSentOrders = new Map(sentOrders);
      newSentOrders.delete(orderId);
      setSentOrders(newSentOrders);

      toast.success("تم إعادة تعيين حالة الطلب");
      fetchOrders(); // Refresh the orders list
    } catch (error) {
      console.error("Error resetting order status:", error);
      toast.error("فشل في إعادة تعيين حالة الطلب");
    }
  };

  const resetAttemptCount = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          send_attempt_count: 0,
        })
        .eq("id", orderId);

      if (error) throw error;

      // Remove from sentOrders state
      const newSentOrders = new Map(sentOrders);
      newSentOrders.delete(orderId);
      setSentOrders(newSentOrders);

      toast.success("تم إعادة تعيين عدد المحاولات - يمكن إعادة الإرسال");
      fetchOrders(); // Refresh the orders list
    } catch (error) {
      console.error("Error resetting attempt count:", error);
      toast.error("فشل في إعادة تعيين عدد المحاولات");
    }
  };

  const sendSingleInvoice = async (order: Order) => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return;
    }

    setSendingIndividual(order.id);
    
    try {
      toast.info(`جاري إرسال فاتورة ${order.booking_reference}...`);
      
      const result = await sendInvoiceToWebhook(order, order.quantity);
      
      if (result.success) {
        const sentTime = new Date();
        const newSentOrders = new Map(sentOrders);
        newSentOrders.set(order.id, { sentAt: sentTime, message: result.message });
        setSentOrders(newSentOrders);
        toast.success(`تم إرسال الفاتورة بنجاح لـ ${order.customers.name}`);
        fetchOrders(); // Refresh to get n8n response
      } else {
        // Increment send attempt count on failure
        const currentAttempts = order.send_attempt_count || 0;
        const newAttempts = currentAttempts + 1;
        
        await supabase
          .from("orders")
          .update({ send_attempt_count: newAttempts })
          .eq("id", order.id);
        
        const newSentOrders = new Map(sentOrders);
        newSentOrders.set(order.id, { sentAt: new Date(), message: result.message });
        setSentOrders(newSentOrders);
        
        if (newAttempts >= 2) {
          toast.error(`فشل إرسال الفاتورة - تم وضعها في الانتظار (محاولة ${newAttempts})`);
        } else {
          toast.error(`فشل إرسال الفاتورة: ${result.message} (محاولة ${newAttempts} من 2)`);
        }
        fetchOrders(); // Refresh to update attempt count
      }
    } catch (error) {
      console.error("Error sending single invoice:", error);
      toast.error("حدث خطأ أثناء إرسال الفاتورة");
    } finally {
      setSendingIndividual(null);
    }
  };

  const markAllAsSent = async () => {
    try {
      const pendingOrders = orders.filter(order => !order.n8n_response_message);
      
      if (pendingOrders.length === 0) {
        toast.info("لا توجد طلبات قيد الإرسال");
        return;
      }

      toast.info(`جاري تحديد ${pendingOrders.length} طلب كمرسل...`);

      const { error } = await supabase
        .from("orders")
        .update({
          n8n_response_message: "تم التحديد كمرسل يدويًا",
          n8n_responded_at: new Date().toISOString(),
        })
        .in("id", pendingOrders.map(o => o.id));

      if (error) throw error;

      toast.success(`تم تحديد ${pendingOrders.length} طلب كمرسل بنجاح`);
      fetchOrders(); // Refresh the orders list
    } catch (error) {
      console.error("Error marking all as sent:", error);
      toast.error("فشل في تحديد الطلبات كمرسلة");
    }
  };

  const sendEmailInvoice = async (order: Order) => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك");
      return;
    }
    if (!order.customers.email) {
      toast.error("لا يوجد بريد إلكتروني لهذا العميل");
      return;
    }

    setSendingEmail(order.id);
    try {
      const countryCode = order.customers.country_code?.replace('+', '') || '974';
      const fullPhone = `${countryCode}${order.customers.phone}`;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const ticketQrCodes = order.ticket_holders?.map(holder => {
        if (!holder.qr_code) return null;
        if (holder.qr_code.startsWith('http')) return holder.qr_code;
        return `${supabaseUrl}/storage/v1/object/public/qr-codes/${holder.qr_code}.png`;
      }).filter(Boolean) || [];
      const ticketTypes = order.ticket_holders?.map(holder => holder.ticket_type) || [];

      const payload = {
        action: 'send_email',
        order_id: order.id,
        booking_reference: order.booking_reference,
        customer_name: order.customers.name,
        customer_phone: order.customers.phone,
        customer_phone_whatsapp: fullPhone,
        customer_email: order.customers.email,
        nationality: order.customers.nationality,
        ticket_type: order.ticket_type,
        quantity: order.quantity,
        total_amount: order.total_amount,
        payment_status: order.payment_status,
        qr_codes: ticketQrCodes,
        ticket_types: ticketTypes,
        event_title: order.events?.title,
        event_date: order.events?.event_date,
        event_location: order.events?.location,
        created_at: order.created_at,
        customers: order.customers,
      };

      const { data, error } = await supabase.functions.invoke('send-to-webhook', {
        body: payload,
      });

      if (error) {
        toast.error(`خطأ في إرسال البريد: ${error.message}`);
        return;
      }

      if (data?.error) {
        toast.error(`خطأ: ${data.error}`);
        return;
      }

      toast.success(`تم إرسال الفاتورة بالبريد لـ ${order.customers.name}`);
    } catch (error) {
      console.error("Error sending email invoice:", error);
      toast.error("حدث خطأ أثناء إرسال البريد");
    } finally {
      setSendingEmail(null);
    }
  };

  // Filter orders based on selected tab
  const filteredOrders = orders.filter((order) => {
    const isPending = isPendingMessage(order.n8n_response_message) || !order.n8n_responded_at;
    const eventDone = isEventDone(order);
    const onHold = isOnHold(order);
    
    if (filterTab === "pending") {
      // Pending = (no message OR message is "sending" OR no n8n_responded_at) AND event NOT done AND NOT on hold
      return isPending && !eventDone && !onHold;
    } else if (filterTab === "sent") {
      // Sent = has actual response message (not "sending") AND has n8n_responded_at
      return !isPendingMessage(order.n8n_response_message) && !!order.n8n_responded_at;
    } else if (filterTab === "eventDone") {
      // Event done = event date has passed AND invoice wasn't sent
      return eventDone && isPending;
    } else if (filterTab === "onHold") {
      // On hold = 2+ failed attempts AND still pending AND event not done
      return onHold && !eventDone;
    }
    return true; // "all" tab shows everything
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-2">إرسال الفواتير (يدوي)</h2>
            <p className="text-sm md:text-base text-muted-foreground">
              إرسال يدوي للفواتير - قم بتفعيل العد التنازلي للإرسال التلقائي
            </p>
          </div>
          
          {/* Mobile & Tablet Layout */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Countdown Display */}
            <div className="flex flex-col items-center gap-1 px-4 py-3 bg-primary/10 rounded-lg">
              <span className="text-xs md:text-sm text-muted-foreground font-bold text-center">
                {isCountdownActive ? "العد التنازلي نشط ⏱️" : "العد التنازلي متوقف ⏸️"}
              </span>
              <span className="text-2xl md:text-3xl font-bold text-primary">{countdown}</span>
            </div>
            
            {/* Control Buttons - Stack on mobile, row on tablet+ */}
            <div className="flex flex-col sm:flex-row gap-2">
              {!isCountdownActive ? (
                <Button
                  onClick={startCountdown}
                  disabled={sending}
                  variant="default"
                  size="default"
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                >
                  <Clock className="w-4 h-4 ml-2" />
                  <span className="text-sm md:text-base">تفعيل العد التنازلي</span>
                </Button>
              ) : (
                <Button
                  onClick={stopCountdown}
                  disabled={sending}
                  variant="destructive"
                  size="default"
                  className="w-full sm:w-auto"
                >
                  <Clock className="w-4 h-4 ml-2" />
                  <span className="text-sm md:text-base">إيقاف العد التنازلي</span>
                </Button>
              )}
              
              <Button
                onClick={() => sendInvoices(false)}
                disabled={sending || pendingOrdersCount === 0 || !webhookUrl}
                className="gap-2 w-full sm:w-auto"
                size="default"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm md:text-base">جاري الإرسال...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span className="text-sm md:text-base">إرسال ({pendingOrdersCount})</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {!webhookUrl && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-destructive text-sm">
              ⚠️ لم يتم تكوين رابط الويب هوك. يرجى تحديثه في إعدادات النظام.
            </p>
          </div>
        )}

        <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as "all" | "pending" | "sent" | "eventDone" | "onHold")} className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <TabsList className="grid grid-cols-5 w-full sm:w-auto">
              <TabsTrigger value="all" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">الكل</span>
                <span className="sm:hidden">الكل</span> ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">قيد الإرسال</span>
                <span className="sm:hidden">قيد</span> ({pendingOrdersCount})
              </TabsTrigger>
              <TabsTrigger value="sent" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">تم الإرسال</span>
                <span className="sm:hidden">مرسل</span> ({sentOrdersCount})
              </TabsTrigger>
              <TabsTrigger value="onHold" className="text-xs sm:text-sm text-red-600">
                <span className="hidden sm:inline">موقوف</span>
                <span className="sm:hidden">موقوف</span> ({onHoldOrdersCount})
              </TabsTrigger>
              <TabsTrigger value="eventDone" className="text-xs sm:text-sm text-orange-600">
                <span className="hidden sm:inline">انتهت الفعالية</span>
                <span className="sm:hidden">انتهت</span> ({eventDoneOrdersCount})
              </TabsTrigger>
            </TabsList>
            {filterTab === "pending" && pendingOrdersCount > 0 && (
              <Button
                onClick={markAllAsSent}
                disabled={sending}
                variant="outline"
                className="gap-2 w-full sm:w-auto text-xs sm:text-sm"
                size="sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">تحديد الكل كمرسل ({pendingOrdersCount})</span>
                <span className="sm:hidden">تحديد الكل ({pendingOrdersCount})</span>
              </Button>
            )}
          </div>

          <TabsContent value={filterTab} className="mt-0">
            <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right whitespace-nowrap">الحالة</TableHead>
                <TableHead className="text-right whitespace-nowrap">رقم الحجز</TableHead>
                <TableHead className="text-right whitespace-nowrap">اسم العميل</TableHead>
                <TableHead className="text-right whitespace-nowrap">الدولة</TableHead>
                <TableHead className="text-right whitespace-nowrap">الهاتف</TableHead>
                <TableHead className="text-right whitespace-nowrap">البريد</TableHead>
                <TableHead className="text-right whitespace-nowrap">نوع التذكرة</TableHead>
                <TableHead className="text-right whitespace-nowrap">الكمية</TableHead>
                <TableHead className="text-right whitespace-nowrap">المبلغ</TableHead>
                <TableHead className="text-right whitespace-nowrap">الفعالية</TableHead>
                <TableHead className="text-right whitespace-nowrap">تاريخ الطلب</TableHead>
                <TableHead className="text-right whitespace-nowrap">رد n8n</TableHead>
                <TableHead className="text-right whitespace-nowrap">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                    {filterTab === "pending" && "لا توجد طلبات قيد الإرسال"}
                    {filterTab === "sent" && "لا توجد طلبات تم إرسالها"}
                    {filterTab === "eventDone" && "لا توجد طلبات انتهت فعاليتها"}
                    {filterTab === "onHold" && "لا توجد طلبات موقوفة"}
                    {filterTab === "all" && "لا توجد طلبات مدفوعة عبر سداد"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => (
                <TableRow key={order.id}>
                    <TableCell>
                      {order.n8n_response_message ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="w-3 h-3" />
                            رد من n8n
                          </Badge>
                          {order.n8n_responded_at && (
                            <span className="text-xs text-muted-foreground" dir="ltr">
                              {format(new Date(order.n8n_responded_at), "dd/MM/yyyy HH:mm:ss")}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground italic">
                            {order.n8n_response_message}
                          </span>
                        </div>
                      ) : sentOrders.has(order.id) ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="w-3 h-3" />
                            تم الإرسال
                          </Badge>
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {format(sentOrders.get(order.id)!.sentAt, "dd/MM/yyyy HH:mm:ss")}
                          </span>
                          {sentOrders.get(order.id)?.message && (
                            <span className="text-xs text-muted-foreground italic">
                              {sentOrders.get(order.id)!.message}
                            </span>
                          )}
                        </div>
                      ) : currentlySending === order.id ? (
                        <Badge variant="secondary" className="gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          جاري الإرسال...
                        </Badge>
                      ) : sending ? (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="w-3 h-3" />
                          قيد الانتظار
                        </Badge>
                      ) : isEventDone(order) ? (
                        <Badge variant="outline" className="gap-1 bg-orange-100 text-orange-700 border-orange-300">
                          <CalendarX className="w-3 h-3" />
                          انتهت الفعالية
                        </Badge>
                      ) : isOnHold(order) ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="gap-1 bg-red-100 text-red-700 border-red-300">
                            <PauseCircle className="w-3 h-3" />
                            موقوف
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            محاولات: {order.send_attempt_count || 0}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline">لم يتم الإرسال</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{order.booking_reference}</TableCell>
                    <TableCell>{order.customers.name}</TableCell>
                    <TableCell className="text-2xl">{COUNTRY_FLAGS[order.customers.nationality || "قطر"] || "🇶🇦"}</TableCell>
                    <TableCell dir="ltr" className="text-right">{order.customers.phone}</TableCell>
                    <TableCell className="text-xs">
                      {order.customers.email ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[120px]" title={order.customers.email}>{order.customers.email}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => sendEmailInvoice(order)}
                            disabled={sendingEmail === order.id || sending}
                            className="h-6 w-6 p-0 shrink-0"
                            title="إرسال الفاتورة بالبريد"
                          >
                            {sendingEmail === order.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Mail className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{order.ticket_type}</TableCell>
                    <TableCell>{order.quantity}</TableCell>
                    <TableCell>{order.total_amount} QAR</TableCell>
                    <TableCell>{order.events?.title || "غير متوفر"}</TableCell>
                    <TableCell>{format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>
                      {order.n8n_response_message ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="default" className="gap-1 w-fit">
                            <CheckCircle className="w-3 h-3" />
                            تم الاستلام
                          </Badge>
                          {order.n8n_responded_at && (
                            <span className="text-xs text-muted-foreground" dir="ltr">
                              {format(new Date(order.n8n_responded_at), "dd/MM/yyyy HH:mm:ss")}
                            </span>
                          )}
                          <span className="text-xs">
                            {order.n8n_response_message}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 whitespace-nowrap">
                        {!order.n8n_response_message && !sentOrders.has(order.id) && !isOnHold(order) && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => sendSingleInvoice(order)}
                            disabled={sending || currentlySending === order.id || sendingIndividual === order.id || !webhookUrl}
                            className="gap-1 text-xs"
                          >
                            {sendingIndividual === order.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                جاري...
                              </>
                            ) : (
                              <>
                                <Send className="w-3 h-3" />
                                إرسال
                              </>
                            )}
                          </Button>
                        )}
                        {isOnHold(order) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resetAttemptCount(order.id)}
                            disabled={sending || currentlySending === order.id || sendingIndividual === order.id}
                            className="gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                          >
                            <RotateCcw className="w-3 h-3" />
                            إعادة المحاولة
                          </Button>
                        )}
                        {(order.n8n_response_message || sentOrders.has(order.id)) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resetOrderStatus(order.id)}
                            disabled={sending || currentlySending === order.id || sendingIndividual === order.id}
                            className="gap-1 text-xs"
                          >
                            <RotateCcw className="w-3 h-3" />
                            إعادة
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                            const qrCodes = order.ticket_holders?.map(h => {
                              if (!h.qr_code) return '';
                              return h.qr_code.startsWith('http') ? h.qr_code : `${supabaseUrl}/storage/v1/object/public/qr-codes/${h.qr_code}.png`;
                            }).filter(Boolean) || [];
                            const ticketTypes = order.ticket_holders?.map(h => h.ticket_type) || [];
                            generateInvoicePdf({
                              booking_reference: order.booking_reference,
                              customer_name: order.customers.name,
                              customer_phone: order.customers.phone,
                              nationality: order.customers.nationality,
                              ticket_type: order.ticket_type,
                              quantity: order.quantity,
                              total_amount: order.total_amount,
                              payment_status: order.payment_status,
                              event_title: order.events?.title || '',
                              event_date: order.events?.event_date || '',
                              qr_codes: qrCodes,
                              ticket_types: ticketTypes,
                              logo_url: settings?.logo_url || 'https://reussir-en-famille.com/log.png',
                            });

                            // Open WhatsApp with random message
                            const messages = [
`مرحباً،

نودّ إعلامك بأنه تم إرفاق الفاتورة الرسمية الخاصة بتذاكر مهرجان قطر للإبل – جزيلات العطا 2026.

الملف المرفق يحتوي على:
• تفاصيل الحجز
• رموز الدخول (QR) لكل تذكرة

📄 مهرجان قطر للإبل – جزيلات العطا 2026 (PDF)

في حال وجود أي استفسار أو رغبة في تعديل بيانات الحجز، يرجى التواصل معنا على:
📞 +974 66625167

نشكر لك اهتمامك، ونتمنى لك تجربة موفقة.

مع التحية،
فريق مهرجان قطر للإبل – جزيلات العطا`,

`مرحباً 🌟

نرحّب بك في مهرجان قطر للإبل – جزيلات العطا 2026.

يسعدنا إعلامك بأنه تم إرفاق فاتورتك الرسمية الخاصة بالتذاكر التي قمت بحجزها، والتي تتضمن جميع تفاصيل الطلب، بما في ذلك رموز الدخول (QR) الخاصة بكل تذكرة.

المستند المرفق:
📄 مهرجان قطر للإبل – جزيلات العطا 2026 (PDF)

في حال وجود أي استفسار، أو رغبتك في تعديل بيانات الحجز، يرجى التواصل معنا عبر خدمة العملاء على الرقم:
📞 +974 66625167

نشكرك لاختيارك مهرجان قطر للإبل – جزيلات العطا 2026 💛
ونتمنى لك تجربة ممتعة، حافلة بالحماس والتميز.

مع أطيب التحيات،
فريق مهرجان قطر للإبل – جزيلات العطا 2026`,

`السلام عليكم،

تم إرسال الفاتورة الخاصة بحجز تذاكر مهرجان قطر للإبل – جزيلات العطا 2026.

الملف المرفق يتضمن بيانات الطلب ورمز الدخول (QR) لكل تذكرة.

📄 ملف PDF مرفق

لأي استفسار أو تحديث على الحجز، يمكنكم التواصل معنا على:
📞 +974 66625167

شاكرين لكم،
فريق مهرجان قطر للإبل – جزيلات العطا 2026`
                            ];

                            const randomMsg = messages[Math.floor(Math.random() * messages.length)];
                            const cleanCode = (order.customers.country_code || '+974').replace('+', '').trim();
                            let cleanPhone = order.customers.phone.replace(/[\s+]/g, '').trim();
                            if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
                            const fullPhone = `${cleanCode}${cleanPhone}`;
                            const whatsappUrl = `https://web.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(randomMsg)}`;
                            window.open(whatsappUrl, '_blank');
                          }}
                          className="gap-1 text-xs"
                        >
                          <FileDown className="w-3 h-3" />
                          فاتورة
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
              </TableBody>
            </Table>
          </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
