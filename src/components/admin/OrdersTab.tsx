import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, MapPin, Calendar, Eye, QrCode, Loader2, XCircle, Printer, Trash2, ShieldCheck, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { api, apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import QRCodeLib from "qrcode";
import { format } from "date-fns";
interface TicketHolder {
  id: string;
  name: string;
  phone: string;
  nationality: string;
  ticket_type: string;
  /** The scannable ticket code. */
  qr_code: string | null;
  /** Stored picture of the code, if one exists. */
  qr_image_url?: string | null;
  is_present: boolean | null;
}
interface Order {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  /** Why the order is in its state (e.g. "paid_after_expiry_no_stock"). */
  payment_note?: string | null;
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
interface OrdersTabProps {
  orders: Order[];
  onRefresh: () => void;
}
export const OrdersTab = ({
  orders,
  onRefresh
}: OrdersTabProps) => {
  const {
    t
  } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [selectedHolder, setSelectedHolder] = useState<TicketHolder | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [generatingQrCodes, setGeneratingQrCodes] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [showGenerateQrButton, setShowGenerateQrButton] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // The QR shown for a ticket: its stored picture, otherwise the code drawn here
  useEffect(() => {
    if (!selectedHolder?.qr_code) {
      setQrCodeImage(null);
      return;
    }
    if (selectedHolder.qr_image_url) {
      setQrCodeImage(selectedHolder.qr_image_url);
      return;
    }
    QRCodeLib.toDataURL(selectedHolder.qr_code, {
      width: 800,
      margin: 2,
      errorCorrectionLevel: 'H'
    }).then(url => setQrCodeImage(url)).catch(err => {
      console.error('Error generating QR code:', err);
      toast.error('Failed to generate QR code');
    });
  }, [selectedHolder]);
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("show_delete_customer_button, show_generate_qr_button")
        .single();

      if (error) throw error;
      if (data) {
        setShowDeleteButton(data.show_delete_customer_button ?? false);
        setShowGenerateQrButton(data.show_generate_qr_button ?? false);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  // Real-time subscription for ticket holders updates
  useEffect(() => {
    const channel = supabase
      .channel('ticket-holders-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ticket_holders'
        },
        (payload) => {

          
          // Update the ticket holders list if viewing details
          if (selectedOrder) {
            setTicketHolders((current) =>
              current.map((holder) =>
                holder.id === payload.new.id
                  ? { ...holder, ...payload.new }
                  : holder
              )
            );
          }
          
          // Also refresh the orders list to update the main view
          onRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedOrder, onRefresh]);
  const generateMissingQrCodes = async () => {
    setGeneratingQrCodes(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('backfill-qr-codes');
      if (error) throw error;
      toast.success(`${data.updated} QR codes generated successfully!`);
      onRefresh();
    } catch (error) {
      console.error('Error generating QR codes:', error);
      toast.error('Failed to generate QR codes');
    } finally {
      setGeneratingQrCodes(false);
    }
  };
  const viewOrderDetails = async (orderId: string) => {
    setSelectedOrder(orderId);
    try {
      const {
        data,
        error
      } = await supabase.from("ticket_holders").select("*").eq("order_id", orderId);
      if (error) throw error;

      setTicketHolders(data || []);
    } catch (error) {
      console.error("Error fetching ticket holders:", error);
      toast.error(t("failedToLoad"));
    }
  };
  const confirmPayment = async (orderId: string) => {
    try {
      const {
        error
      } = await supabase.from("orders").update({
        payment_status: "confirmed"
      }).eq("id", orderId);
      if (error) throw error;
      toast.success(t("paymentConfirmed"));
      onRefresh();
    } catch (error) {
      toast.error(t("failedToLoad"));
    }
  };

  const togglePaymentStatus = async (orderId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "confirmed" ? "pending" : "confirmed";
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();

      // The database keeps stock right: re-activating a cancelled/failed order
      // re-reserves its seats, or is refused if they are gone.
      const { data: order, error } = await supabase
        .from("orders")
        .update(
          newStatus === "confirmed"
            ? { payment_status: "confirmed", confirmed_at: now, confirmed_by: user?.id ?? null, paid_at: now, payment_note: null }
            : { payment_status: "pending", confirmed_at: null, confirmed_by: null },
        )
        .eq("id", orderId)
        .select("booking_reference")
        .single();

      if (error) {
        if (error.message.includes("insufficient_stock")) {
          toast.error("لا توجد تذاكر كافية لإعادة تفعيل هذا الطلب");
          return;
        }
        throw error;
      }

      // Mirror the confirmation on the individual tickets
      await supabase
        .from("ticket_holders")
        .update(newStatus === "confirmed" ? { confirmed_at: now, confirmed_by: user?.id ?? null } : { confirmed_at: null, confirmed_by: null })
        .eq("order_id", orderId);

      if (newStatus !== "confirmed") {
        toast.success("تم إلغاء تأكيد الحجز");
        onRefresh();
        return;
      }

      // Make sure every ticket has its QR picture (only fills in the missing ones)
      const qr = await supabase.functions.invoke('backfill-qr-codes');
      if (qr.error) toast.error('تم التأكيد لكن فشل توليد رموز QR');

      // Tell the automation (WhatsApp tickets): the server builds the message from the database
      const { data: webhook, error: webhookError } = await supabase.functions.invoke('send-to-webhook', {
        body: { notify: "payment_confirmed", booking_reference: order.booking_reference },
      });
      if (webhookError) {
        toast.error('تم تأكيد الحجز لكن فشل الإرسال للنظام: ' + webhookError.message);
      } else if (webhook?.error) {
        toast.error(
          webhook.status === 404
            ? '⚠️ تم تأكيد الحجز لكن n8n webhook غير نشط! قم بتفعيل الـ workflow في n8n.'
            : 'تم تأكيد الحجز لكن فشل الإرسال للنظام',
          { duration: 8000 },
        );
      } else {
        toast.success("تم تأكيد الحجز وإرساله للنظام بنجاح ✓");
      }
      onRefresh();
    } catch (error) {
      console.error("Error toggling payment status:", error);
      toast.error("فشل في تغيير حالة الحجز: " + (error instanceof Error ? error.message : 'خطأ غير معروف'));
    }
  };

  /** Ask Sadad directly whether this order was paid (for orders that could not be confirmed automatically). */
  const verifyWithSadad = async (order: Order) => {
    setVerifying(order.id);
    const result = await api.verifyPayment(order.booking_reference);
    setVerifying(null);
    if (!result.ok) {
      toast.error(apiErrorMessage(result.error, t));
      return;
    }
    if (result.data.payment_status === "confirmed") toast.success("سداد أكّد الدفع — تم تأكيد الحجز ✓");
    else toast.info("لم يُسجّل سداد دفعاً لهذا الحجز بعد");
    onRefresh();
  };

  /** Cancel an unpaid booking and put its seats back on sale. */
  const releaseOrder = async (order: Order) => {
    if (!confirm(`إلغاء الحجز ${order.booking_reference} وإعادة تذاكره للبيع؟`)) return;
    const result = await api.cancelOrder(order.id, "released by admin");
    if (!result.ok) {
      toast.error(apiErrorMessage(result.error, t));
      return;
    }
    toast.success("تم إلغاء الحجز وإعادة التذاكر للبيع");
    onRefresh();
  };
  const deleteOrder = async () => {
    if (!orderToDelete) {
      console.error("No order selected for deletion");
      return;
    }
    

    
    try {
      // First delete ticket holders
      const { error: ticketError } = await supabase
        .from("ticket_holders")
        .delete()
        .eq("order_id", orderToDelete);
      
      if (ticketError) {
        console.error("Error deleting ticket holders:", ticketError);
        throw ticketError;
      }

      // Then delete the order
      const { error: orderError } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderToDelete);
      
      if (orderError) {
        console.error("Error deleting order:", orderError);
        throw orderError;
      }


      toast.success("تم حذف الطلب والتذاكر بنجاح");
      setOrderToDelete(null);
      onRefresh();
    } catch (error) {
      console.error("Error deleting order:", error);
      toast.error("فشل حذف الطلب");
      setOrderToDelete(null);
    }
  };
  const filterOrders = (status: string) => {
    if (status === "all") return orders;
    if (status === "success") return orders.filter(o => o.payment_status === "confirmed");
    if (status === "failed") return orders.filter(o => o.payment_status === "failed" || o.payment_status === "cancelled");
    if (status === "pending") return orders.filter(o => o.payment_status === "pending");
    return orders;
  };
  const OrderCard = ({
    order
  }: {
    order: Order;
  }) => <Card className="p-6 hover:shadow-lg transition-shadow">
      <div className="grid md:grid-cols-6 gap-4 items-center">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("reference")}</p>
          <p className="font-mono font-semibold text-primary">{order.booking_reference}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("customer")}</p>
          <p className="font-semibold">{order.customers.name}</p>
          <p className="text-sm text-muted-foreground">{order.customers.email}</p>
          <p className="text-xs text-muted-foreground">{order.customers.phone}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("ticket")}</p>
          <p className="font-semibold capitalize">
            {order.ticket_type === "vip" ? t("vipAccess") : order.ticket_type === "normal" ? t("generalAdmission") : t("parking")} × {order.quantity}
          </p>
          <p className="text-sm font-semibold text-primary">{order.total_amount.toFixed(2)} {t("qar")}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("paymentMethod")}</p>
          <p className="font-medium capitalize">{order.payment_method}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("status")}</p>
          <Badge variant={order.payment_status === "confirmed" ? "default" : order.payment_status === "failed" || order.payment_status === "cancelled" ? "destructive" : "secondary"} className="font-lusail">
            {order.payment_status === "confirmed" ? t("confirmed") : order.payment_status === "failed" ? t("failed") : order.payment_status === "cancelled" ? "ملغي" : t("pending")}
          </Badge>
          {order.payment_note === "paid_after_expiry_no_stock" && (
            <p className="mt-1 text-xs font-semibold text-destructive">⚠️ دُفع بعد انتهاء الحجز ولا توجد تذاكر — يلزم استرداد المبلغ</p>
          )}
          {order.payment_note === "expired" && <p className="mt-1 text-xs text-muted-foreground">انتهت مهلة الدفع</p>}
        </div>
        
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/tickets?ref=${order.booking_reference}`)} className="font-lusail flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" />
            عرض التذاكر
          </Button>
          <Button size="sm" variant="outline" onClick={() => viewOrderDetails(order.id)} className="font-lusail flex items-center justify-center gap-2">
            {t("viewDetails")}
            <Eye className="w-4 h-4" />
          </Button>
          {order.payment_method === "sadad" && order.payment_status !== "confirmed" && order.payment_status !== "cancelled" && (
            <Button size="sm" variant="secondary" disabled={verifying === order.id} onClick={() => verifyWithSadad(order)} className="font-lusail flex items-center justify-center gap-2">
              {verifying === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              تحقق من سداد
            </Button>
          )}
          {order.payment_status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => releaseOrder(order)} className="font-lusail flex items-center justify-center gap-2">
              <Undo2 className="w-4 h-4" />
              إلغاء وإعادة للبيع
            </Button>
          )}
          <Button 
            size="sm" 
            variant={order.payment_status === "confirmed" ? "destructive" : "default"}
            onClick={() => togglePaymentStatus(order.id, order.payment_status)} 
            className="font-lusail flex items-center justify-center gap-2"
          >
            {order.payment_status === "confirmed" ? (
              <>
                <XCircle className="w-4 h-4" />
                إلغاء التأكيد
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {t("confirmPayment")}
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t space-y-2">
        {order.events && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-semibold text-primary">تاريخ الفعالية:</span>
            <span className="font-medium">
              {format(new Date(order.events.event_date), 'dd/MM/yyyy')}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>تاريخ الحجز: </span>
              {format(new Date(order.created_at), 'dd/MM/yyyy - HH:mm')}
            </div>
            {order.events && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{order.events.location}</span>
              </div>
            )}
          </div>
          {showDeleteButton && (
            <Button 
              size="icon" 
              variant="destructive" 
              onClick={(e) => {
                e.stopPropagation();

                setOrderToDelete(order.id);
              }}
              className="h-8 w-8"
              title="حذف الطلب"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>;
  const filteredOrders = filterOrders(activeTab);
  const stats = {
    total: orders.length,
    success: orders.filter(o => o.payment_status === "confirmed").length,
    failed: orders.filter(o => o.payment_status === "failed" || o.payment_status === "cancelled").length,
    pending: orders.filter(o => o.payment_status === "pending").length
  };
  return <div className="space-y-6">
      {/* Generate QR Codes Button */}
      {showGenerateQrButton && (
        <div className="flex justify-end">
          <Button onClick={generateMissingQrCodes} disabled={generatingQrCodes} className="font-lusail">
            {generatingQrCodes ? <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating QR Codes...
              </> : <>
                <QrCode className="w-4 h-4 mr-2" />
                Generate Missing QR Codes
              </>}
          </Button>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <h3 className="text-sm text-muted-foreground mb-2">{t("totalOrders")}</h3>
          <p className="text-3xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-6 bg-green-50 dark:bg-green-950">
          <h3 className="text-sm text-muted-foreground mb-2">{t("successfulPaymentsCount")}</h3>
          <p className="text-3xl font-bold text-green-600">{stats.success}</p>
        </Card>
        <Card className="p-6 bg-red-50 dark:bg-red-950">
          <h3 className="text-sm text-muted-foreground mb-2">{t("failedPayments")}</h3>
          <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
        </Card>
        <Card className="p-6 bg-yellow-50 dark:bg-yellow-950">
          <h3 className="text-sm text-muted-foreground mb-2">{t("pendingPaymentsCount")}</h3>
          <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
        </Card>
      </div>

      {/* Orders Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 font-lusail">
          <TabsTrigger value="all">{t("allOrders")} ({stats.total})</TabsTrigger>
          <TabsTrigger value="success">{t("success")} ({stats.success})</TabsTrigger>
          <TabsTrigger value="pending">{t("pending")} ({stats.pending})</TabsTrigger>
          <TabsTrigger value="failed">{t("failed")} ({stats.failed})</TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {filteredOrders.length === 0 ? <Card className="p-12 text-center">
              <p className="text-muted-foreground font-lusail">{t("noOrders")}</p>
            </Card> : filteredOrders.map(order => <OrderCard key={order.id} order={order} />)}
        </TabsContent>
      </Tabs>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-lusail text-2xl">{t("ticketHoldersTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {ticketHolders.length > 0 ? <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-lusail">#</TableHead>
                    <TableHead className="text-right font-lusail">{t("holderName")}</TableHead>
                    <TableHead className="text-right font-lusail">{t("holderPhone")}</TableHead>
                    <TableHead className="text-right font-lusail">{t("holderNationality")}</TableHead>
                    <TableHead className="text-right font-lusail">{t("ticketType")}</TableHead>
                    <TableHead className="text-right font-lusail">QR Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketHolders.map((holder, index) => <TableRow key={holder.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-medium">{holder.name}</TableCell>
                      <TableCell>{holder.phone}</TableCell>
                      <TableCell>{holder.nationality}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize font-lusail">
                          {holder.ticket_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {holder.qr_code ? <Button size="sm" variant="ghost" onClick={() => setSelectedHolder(holder)} className="h-8 w-8 p-0" title="View QR Code">
                              <QrCode className="h-5 w-5" />
                            </Button> : <span className="text-xs text-muted-foreground">No QR</span>}
                          {holder.is_present ? <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-xs font-medium">حاضر</span>
                            </div> : <div className="flex items-center gap-1 text-muted-foreground">
                              <XCircle className="w-4 h-4" />
                              <span className="text-xs">غائب</span>
                            </div>}
                        </div>
                      </TableCell>
                    </TableRow>)}
                </TableBody>
              </Table> : <p className="text-center text-muted-foreground py-8 font-lusail">
                {t("noTicketHolders")}
              </p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!selectedHolder} onOpenChange={() => setSelectedHolder(null)}>
        <DialogContent className="max-w-fit">
          <DialogHeader>
            <DialogTitle className="font-lusail text-2xl">QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4 gap-4">
            {qrCodeImage ? <>
                <img src={qrCodeImage} alt="Ticket QR Code" className="w-[800px] h-[800px] object-contain" />
                <div className="text-center">
                  <p className="text-2xl font-bold font-lusail">{selectedHolder?.name}</p>
                  <p className="text-lg text-muted-foreground">{selectedHolder?.phone}</p>
                  <p className="text-sm text-muted-foreground capitalize">{selectedHolder?.ticket_type}</p>
                </div>
              </> : <div className="w-[800px] h-[800px] flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin" />
              </div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!orderToDelete} onOpenChange={() => setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-lusail">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="font-lusail">
              هل أنت متأكد من حذف هذا الطلب؟ سيتم حذف جميع التذاكر المرتبطة به. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-lusail">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteOrder} className="font-lusail bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
};