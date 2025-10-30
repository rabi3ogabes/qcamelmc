import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Eye, Loader2 } from "lucide-react";
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
  payment_id: string | null;
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

interface SadadVerificationTabProps {
  onRefresh: () => void;
}

export const SadadVerificationTab = ({ onRefresh }: SadadVerificationTabProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingOrder, setProcessingOrder] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingSadadOrders();
    
    // Subscribe to real-time changes
    const channel = supabase
      .channel('sadad-verification-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          fetchPendingSadadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPendingSadadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, email, phone), events(title, event_date, location)")
        .eq("payment_method", "sadad")
        .eq("payment_status", "pending")
        .eq("sadad_manually_verified", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Failed to load Sadad orders:", error);
      toast.error("فشل تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  };

  const confirmPayment = async (orderId: string) => {
    setProcessingOrder(orderId);
    try {
      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update order status and clear manual verification
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          payment_status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id || null,
          sadad_manually_verified: false
        })
        .eq("id", orderId);

      if (orderError) throw orderError;

      // Update ticket holders
      const { error: ticketError } = await supabase
        .from("ticket_holders")
        .update({
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id || null
        })
        .eq("order_id", orderId);

      if (ticketError) throw ticketError;

      // Generate QR codes
      await supabase.functions.invoke('backfill-qr-codes');

      // Send to webhook
      const { data: orderData } = await supabase
        .from("orders")
        .select(`
          *,
          customers (*),
          events (*),
          ticket_holders (*)
        `)
        .eq("id", orderId)
        .single();

      if (orderData) {
        await supabase.functions.invoke('send-to-webhook', {
          body: {
            ...orderData,
            action: "payment_confirmed",
            timestamp: new Date().toISOString()
          }
        });
      }

      toast.success("تم تأكيد الدفع بنجاح ✓");
      fetchPendingSadadOrders();
      onRefresh();
    } catch (error: any) {
      console.error("Error confirming payment:", error);
      toast.error("فشل تأكيد الدفع: " + (error?.message || 'خطأ غير معروف'));
    } finally {
      setProcessingOrder(null);
    }
  };

  const rejectPayment = async (orderId: string) => {
    setProcessingOrder(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "cancelled",
          sadad_manually_verified: false
        })
        .eq("id", orderId);

      if (error) throw error;

      toast.success("تم رفض الدفع");
      fetchPendingSadadOrders();
      onRefresh();
    } catch (error: any) {
      console.error("Error rejecting payment:", error);
      toast.error("فشل رفض الدفع");
    } finally {
      setProcessingOrder(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
        <h3 className="text-lg font-semibold mb-2">لا توجد طلبات سداد في انتظار التأكيد</h3>
        <p className="text-muted-foreground">جميع الطلبات تم معالجتها</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <CheckCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
              طلبات سداد بانتظار التأكيد
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              يوجد {orders.length} طلب في انتظار التحقق من الدفع. تأكد من استلام المبلغ قبل الموافقة.
            </p>
          </div>
        </div>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم المرجع</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-right">الفعالية</TableHead>
              <TableHead className="text-right">التذاكر</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">تاريخ الطلب</TableHead>
              <TableHead className="text-right">رقم المعاملة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono font-semibold text-primary">
                  {order.booking_reference}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-semibold">{order.customers.name}</p>
                    <p className="text-sm text-muted-foreground">{order.customers.phone}</p>
                  </div>
                </TableCell>
                <TableCell>
                  {order.events ? (
                    <div>
                      <p className="font-medium">{order.events.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(order.events.event_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="capitalize">
                    {order.ticket_type === "vip" ? "VIP" : order.ticket_type === "normal" ? "عادي" : "مواقف"} × {order.quantity}
                  </span>
                </TableCell>
                <TableCell className="font-semibold">
                  {order.total_amount.toFixed(2)} ر.ق
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {order.payment_id || '-'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => confirmPayment(order.id)}
                      disabled={processingOrder === order.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingOrder === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 ml-1" />
                          تأكيد
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => rejectPayment(order.id)}
                      disabled={processingOrder === order.id}
                    >
                      <XCircle className="w-4 h-4 ml-1" />
                      رفض
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
