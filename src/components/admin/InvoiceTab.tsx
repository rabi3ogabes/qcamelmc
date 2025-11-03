import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, Loader2, CheckCircle, Clock, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentOrders, setSentOrders] = useState<Map<string, { sentAt: Date; message?: string }>>(new Map());
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [currentlySending, setCurrentlySending] = useState<string | null>(null);
  const [autoInvoiceInterval, setAutoInvoiceInterval] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [batchMin, setBatchMin] = useState<number>(1);
  const [batchMax, setBatchMax] = useState<number>(10);
  const [delayMin, setDelayMin] = useState<number>(300);
  const [delayMax, setDelayMax] = useState<number>(600);

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
          filter: 'payment_method=in.(sadad,cash_pos)'
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

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isCountdownActive && countdown > 0 && !sending) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0 && isCountdownActive && !sending) {
      // Countdown reached 0, trigger send
      sendInvoices();
      setIsCountdownActive(false);
      setCountdown(autoInvoiceInterval);
    }

    return () => clearTimeout(timer);
  }, [countdown, isCountdownActive, sending]);

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
        .in("payment_method", ["sadad", "cash_pos"])
        .eq("payment_status", "confirmed")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
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
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Parse the response from n8n
      const responseData = await response.json();
      
      if (!response.ok) {
        // Handle error responses from n8n
        const errorMessage = responseData.message || `HTTP error! status: ${response.status}`;
        console.error("n8n webhook error:", responseData);
        toast.error(`خطأ من n8n: ${errorMessage}`);
        return { success: false, message: errorMessage };
      }

      // Handle successful response
      if (responseData.success !== false) {
        console.log("n8n response:", responseData);
        const message = responseData.message || "تم الإرسال بنجاح";
        if (responseData.message) {
          toast.success(`رد n8n: ${message}`);
        }
        return { success: true, message };
      } else {
        // n8n returned success: false
        const errorMessage = responseData.message || "فشل الإرسال";
        toast.warning(`تحذير من n8n: ${errorMessage}`);
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error("Error sending to webhook:", error);
      const errorMessage = error instanceof Error ? error.message : 'خطأ غير معروف';
      toast.error(`خطأ في الاتصال بـ n8n: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  };

  const sendInvoices = async () => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return;
    }

    setIsCountdownActive(false);
    setSending(true);
    const newSentOrders = new Map(sentOrders);

    // Filter orders that need to be sent (exclude those with n8n response)
    const allOrdersToSend = orders.filter(
      order => !sentOrders.has(order.id) && !order.n8n_response_message && !order.n8n_responded_at
    );

    if (allOrdersToSend.length === 0) {
      setSending(false);
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
      
      const result = await sendInvoiceToWebhook(order, totalQuantity);
      
      if (result.success) {
        const sentTime = new Date();
        newSentOrders.set(order.id, { sentAt: sentTime, message: result.message });
        setSentOrders(new Map(newSentOrders));
        toast.success(`تم إرسال الفاتورة لـ ${order.customers.name}`);
      } else {
        newSentOrders.set(order.id, { sentAt: new Date(), message: result.message });
        setSentOrders(new Map(newSentOrders));
        toast.error(`فشل إرسال الفاتورة لـ ${order.customers.name}`);
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
    setCountdown(autoInvoiceInterval);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">إرسال الفواتير</h2>
            <p className="text-muted-foreground">
              إرسال الفواتير للطلبات المدفوعة عبر سداد إلى n8n (5-10 دقائق بشكل عشوائي بين كل رسالة)
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {isCountdownActive && (
              <div className="flex flex-col items-center gap-1 px-4 py-2 bg-primary/10 rounded-lg">
                <span className="text-sm text-muted-foreground">العد التنازلي</span>
                <span className="text-3xl font-bold text-primary">{countdown}</span>
              </div>
            )}
            {isCountdownActive ? (
              <Button
                onClick={stopCountdown}
                disabled={sending}
                variant="destructive"
                className="gap-2"
              >
                <Clock className="w-4 h-4" />
                إيقاف العد التنازلي
              </Button>
            ) : (
              <Button
                onClick={startCountdown}
                disabled={sending || orders.filter(o => !o.n8n_response_message && !o.n8n_responded_at).length === 0 || !webhookUrl}
                variant="secondary"
                className="gap-2"
              >
                <Clock className="w-4 h-4" />
                بدء العد التنازلي
              </Button>
            )}
            <Button
              onClick={sendInvoices}
              disabled={sending || orders.filter(o => !o.n8n_response_message && !o.n8n_responded_at).length === 0 || !webhookUrl}
              className="gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  إرسال الفواتير ({orders.filter(o => !o.n8n_response_message && !o.n8n_responded_at).length})
                </>
              )}
            </Button>
          </div>
        </div>

        {!webhookUrl && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-destructive text-sm">
              ⚠️ لم يتم تكوين رابط الويب هوك. يرجى تحديثه في إعدادات النظام.
            </p>
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">رقم الحجز</TableHead>
                <TableHead className="text-right">اسم العميل</TableHead>
                <TableHead className="text-right">الهاتف</TableHead>
                <TableHead className="text-right">نوع التذكرة</TableHead>
                <TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الفعالية</TableHead>
                <TableHead className="text-right">تاريخ الطلب</TableHead>
                <TableHead className="text-right">رد n8n</TableHead>
                <TableHead className="text-right">إعادة الإرسال</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    لا توجد طلبات مدفوعة عبر سداد
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
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
                      ) : (
                        <Badge variant="outline">لم يتم الإرسال</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{order.booking_reference}</TableCell>
                    <TableCell>{order.customers.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">{order.customers.phone}</TableCell>
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
                      {(order.n8n_response_message || sentOrders.has(order.id)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resetOrderStatus(order.id)}
                          disabled={sending || currentlySending === order.id}
                          className="gap-2"
                        >
                          <RotateCcw className="w-4 h-4" />
                          إعادة
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
