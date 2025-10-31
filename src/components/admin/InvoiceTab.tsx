import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, Loader2, CheckCircle, Clock } from "lucide-react";
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
  n8n_response_message: string | null;
  n8n_responded_at: string | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    country_code: string;
  };
  events?: {
    title: string;
    event_date: string;
    location: string;
  };
}

export const InvoiceTab = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentOrders, setSentOrders] = useState<Map<string, { sentAt: Date; message?: string }>>(new Map());
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [currentlySending, setCurrentlySending] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(60);
  const [isCountdownActive, setIsCountdownActive] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchWebhookUrl();

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
      setCountdown(60);
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

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, email, phone, country_code), events(title, event_date, location)")
        .eq("payment_method", "sadad")
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

  const sendInvoiceToWebhook = async (order: Order): Promise<{ success: boolean; message: string }> => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return { success: false, message: "لم يتم تكوين رابط الويب هوك" };
    }

    try {
      // Construct full phone number with country code (without +) for WhatsApp
      const countryCode = order.customers.country_code?.replace('+', '') || '974';
      const fullPhone = `${countryCode}${order.customers.phone}`;

      const payload = {
        booking_reference: order.booking_reference,
        customer_name: order.customers.name,
        customer_phone: order.customers.phone,
        customer_phone_whatsapp: fullPhone,
        customer_email: order.customers.email,
        ticket_type: order.ticket_type,
        quantity: order.quantity,
        total_amount: order.total_amount,
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

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      if (sentOrders.has(order.id)) {
        continue; // Skip already sent orders
      }

      setCurrentlySending(order.id);
      toast.info(`إرسال فاتورة ${i + 1} من ${orders.length}...`);
      
      const result = await sendInvoiceToWebhook(order);
      
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

      // Wait random time between 5-10 minutes before sending the next one, unless it's the last order
      if (i < orders.length - 1) {
        const minDelay = 300000; // 5 minutes
        const maxDelay = 600000; // 10 minutes
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        const delayMinutes = Math.round(randomDelay / 60000);
        toast.info(`انتظار ${delayMinutes} دقائق قبل إرسال الفاتورة التالية...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
    }

    setSending(false);
    setCurrentlySending(null);
    setCountdown(60);
    toast.success("تم الانتهاء من إرسال جميع الفواتير!");
  };

  const startCountdown = () => {
    setCountdown(60);
    setIsCountdownActive(true);
    toast.info("بدأ العد التنازلي - 60 ثانية");
  };

  const stopCountdown = () => {
    setIsCountdownActive(false);
    setCountdown(60);
    toast.info("تم إيقاف العد التنازلي");
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
                disabled={sending || orders.length === 0 || !webhookUrl}
                variant="secondary"
                className="gap-2"
              >
                <Clock className="w-4 h-4" />
                بدء العد التنازلي (60 ثانية)
              </Button>
            )}
            <Button
              onClick={sendInvoices}
              disabled={sending || orders.length === 0 || !webhookUrl}
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
                  إرسال الفواتير ({orders.length})
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
