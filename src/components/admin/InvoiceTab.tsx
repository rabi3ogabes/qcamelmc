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
  customers: {
    name: string;
    email: string;
    phone: string;
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
  const [sentOrders, setSentOrders] = useState<Set<string>>(new Set());
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    fetchWebhookUrl();
  }, []);

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
        .select("*, customers(name, email, phone), events(title, event_date, location)")
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

  const sendInvoiceToWebhook = async (order: Order) => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return false;
    }

    try {
      const payload = {
        booking_reference: order.booking_reference,
        customer_name: order.customers.name,
        customer_phone: order.customers.phone,
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("Error sending to webhook:", error);
      return false;
    }
  };

  const sendInvoices = async () => {
    if (!webhookUrl) {
      toast.error("لم يتم تكوين رابط الويب هوك. يرجى تحديثه في الإعدادات");
      return;
    }

    setSending(true);
    const newSentOrders = new Set(sentOrders);

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      if (sentOrders.has(order.id)) {
        continue; // Skip already sent orders
      }

      toast.info(`إرسال فاتورة ${i + 1} من ${orders.length}...`);
      
      const success = await sendInvoiceToWebhook(order);
      
      if (success) {
        newSentOrders.add(order.id);
        setSentOrders(new Set(newSentOrders));
        toast.success(`تم إرسال الفاتورة لـ ${order.customers.name}`);
      } else {
        toast.error(`فشل إرسال الفاتورة لـ ${order.customers.name}`);
      }

      // Wait 5 minutes (300000ms) before sending the next one, unless it's the last order
      if (i < orders.length - 1) {
        toast.info("انتظار 5 دقائق قبل إرسال الفاتورة التالية...");
        await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
      }
    }

    setSending(false);
    toast.success("تم الانتهاء من إرسال جميع الفواتير!");
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
              إرسال الفواتير للطلبات المدفوعة عبر سداد إلى n8n (5 دقائق بين كل رسالة)
            </p>
          </div>
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
                      {sentOrders.has(order.id) ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="w-3 h-3" />
                          تم الإرسال
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
