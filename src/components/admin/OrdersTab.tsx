import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, MapPin, Calendar, Eye, QrCode, Loader2, XCircle, Printer, Trash2, Grid3x3, List, Search, Banknote, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import QRCodeLib from "qrcode";
import { format } from "date-fns";
interface TicketHolder {
  id: string;
  name: string;
  phone: string;
  nationality: string;
  ticket_type: string;
  qr_code: string | null;
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
  sadad_manually_verified?: boolean;
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
  const [activeTab, setActiveTab] = useState("success");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("ordersViewMode");
    return (saved === "grid" || saved === "list") ? saved : "list";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [selectedHolder, setSelectedHolder] = useState<TicketHolder | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [generatingQrCodes, setGeneratingQrCodes] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [showGenerateQrButton, setShowGenerateQrButton] = useState(false);

  // Generate QR code image when selectedHolder changes
  useEffect(() => {
    if (selectedHolder?.qr_code) {
      // Check if it's already a URL
      if (selectedHolder.qr_code.startsWith('http')) {
        setQrCodeImage(selectedHolder.qr_code);
      } else {
        // Generate QR code from text
        QRCodeLib.toDataURL(selectedHolder.qr_code, {
          width: 800,
          margin: 2,
          errorCorrectionLevel: 'H'
        }).then(url => setQrCodeImage(url)).catch(err => {
          console.error('Error generating QR code:', err);
          toast.error('Failed to generate QR code');
        });
      }
    } else {
      setQrCodeImage(null);
    }
  }, [selectedHolder]);

  useEffect(() => {
    localStorage.setItem("ordersViewMode", viewMode);
  }, [viewMode]);

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
        setShowDeleteButton(data.show_delete_customer_button || false);
        setShowGenerateQrButton(data.show_generate_qr_button || false);
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
          console.log('Ticket holder updated:', payload);
          
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
      console.log("Ticket holders data:", data);
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
      console.log('=== Starting togglePaymentStatus ===');
      console.log('Order ID:', orderId);
      console.log('Current Status:', currentStatus);
      
      const newStatus = currentStatus === "confirmed" ? "cancelled" : "confirmed";
      console.log('New Status:', newStatus);
      
      // Fetch full order details before updating
      console.log('Fetching order data...');
      const { data: orderData, error: fetchError } = await supabase
        .from("orders")
        .select(`
          *,
          customers(*),
          events(*),
          ticket_holders(*)
        `)
        .eq("id", orderId)
        .single();
      
      if (fetchError) {
        console.error('Error fetching order data:', fetchError);
        throw fetchError;
      }
      
      console.log('Order data fetched successfully');
      
      // Get current admin user ID
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update the order status with confirmed_at and confirmed_by
      console.log('Updating order status...');
      const updateData: any = { payment_status: newStatus };
      
      if (newStatus === "confirmed") {
        updateData.confirmed_at = new Date().toISOString();
        updateData.confirmed_by = user?.id || null;
      } else {
        // Clear confirmation fields when cancelling
        updateData.confirmed_at = null;
        updateData.confirmed_by = null;
      }
      
      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId);
      
      if (error) {
        console.error('Error updating order:', error);
        throw error;
      }
      
      console.log('Order status updated successfully with confirmed_at and confirmed_by');
      
      // Also update ticket_holders with the same confirmation details
      if (newStatus === "confirmed") {
        const { error: ticketHoldersError } = await supabase
          .from("ticket_holders")
          .update({
            confirmed_at: updateData.confirmed_at,
            confirmed_by: updateData.confirmed_by
          })
          .eq("order_id", orderId);
        
        if (ticketHoldersError) {
          console.error('Error updating ticket holders:', ticketHoldersError);
        } else {
          console.log('Ticket holders updated with confirmation details');
        }
        
        // Generate QR code images for all ticket holders and WAIT for completion
        console.log('Generating QR code images...');
        const { data: qrResponse, error: qrError } = await supabase.functions.invoke('backfill-qr-codes');
        
        if (qrError) {
          console.error('Error generating QR codes:', qrError);
          toast.error('تم التأكيد لكن فشل توليد رموز QR');
        } else {
          console.log('QR codes generated successfully:', qrResponse);
          
          // Wait a moment for database to update
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        // Clear ticket holders confirmation when cancelling
        const { error: ticketHoldersError } = await supabase
          .from("ticket_holders")
          .update({
            confirmed_at: null,
            confirmed_by: null
          })
          .eq("order_id", orderId);
        
        if (ticketHoldersError) {
          console.error('Error clearing ticket holders confirmation:', ticketHoldersError);
        }
      }
      
      // Send to webhook with updated status
      if (newStatus === "confirmed") {
        try {
          // Re-fetch order data with updated ticket_holders
          const { data: updatedOrderData, error: refetchError } = await supabase
            .from("orders")
            .select(`
              *,
              customers (*),
              events (*),
              ticket_holders (*)
            `)
            .eq("id", orderId)
            .single();
          
          if (refetchError) {
            console.error('Error re-fetching order:', refetchError);
            throw refetchError;
          }
          
          const webhookData = {
            ...updatedOrderData,
            action: "payment_confirmed",
            timestamp: new Date().toISOString()
          };
          
          console.log('=== Sending to webhook ===');
          
          const { data: webhookResponse, error: webhookError } = await supabase.functions.invoke('send-to-webhook', {
            body: webhookData
          });
          
          if (webhookError) {
            console.error('Webhook invocation error:', webhookError);
            toast.error('تم تحديث الحالة لكن فشل الإرسال للنظام: ' + webhookError.message);
          } else if (webhookResponse?.error) {
            console.error('Webhook returned error:', webhookResponse);
            
            // Show specific error messages based on the response
            if (webhookResponse.status === 404) {
              toast.error('⚠️ تم تحديث الحالة لكن n8n webhook غير نشط!\n\nالحل: قم بتفعيل الـ workflow في n8n (اضغط على Toggle في أعلى الصفحة)', {
                duration: 8000,
              });
            } else if (webhookResponse.solution) {
              toast.error('تم تحديث الحالة لكن: ' + webhookResponse.solution, {
                duration: 8000,
              });
            } else {
              toast.error('تم تحديث الحالة لكن فشل الإرسال للنظام');
            }
          } else {
            console.log('✅ Webhook response:', webhookResponse);
            toast.success("تم تأكيد الحجز وإرساله للنظام بنجاح ✓");
          }
        } catch (webhookError: any) {
          console.error('Exception sending to webhook:', webhookError);
          toast.error('تم تحديث الحالة لكن حدث خطأ في الإرسال للنظام');
        }
      } else {
        toast.success("تم إلغاء تأكيد الحجز");
      }
      
      console.log('=== Finished togglePaymentStatus ===');
      onRefresh();
    } catch (error: any) {
      console.error("Error toggling payment status:", error);
      toast.error("فشل في تغيير حالة الحجز: " + (error?.message || 'خطأ غير معروف'));
    }
  };

  const deleteOrder = async () => {
    if (!orderToDelete) {
      console.error("No order selected for deletion");
      return;
    }
    
    console.log("Deleting order:", orderToDelete);
    
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

      console.log("Order deleted successfully");
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
    // Only exclude pending orders (they need manual verification or are incomplete)
    const filteredOrders = orders.filter(o => o.payment_status !== 'pending');
    
    // Apply status filter
    let statusFiltered = filteredOrders;
    if (status === "success") statusFiltered = filteredOrders.filter(o => o.payment_status === "confirmed");
    if (status === "failed") statusFiltered = filteredOrders.filter(o => o.payment_status === "cancelled");
    
    // Apply search filter
    if (!searchQuery.trim()) return statusFiltered;
    
    const query = searchQuery.toLowerCase().trim();
    return statusFiltered.filter(o => 
      o.booking_reference.toLowerCase().includes(query) ||
      o.customers.name.toLowerCase().includes(query) ||
      o.customers.phone.toLowerCase().includes(query)
    );
  };
  const OrderCard = ({
    order
  }: {
    order: Order;
  }) => <Card className={`p-6 hover:shadow-lg transition-shadow ${order.sadad_manually_verified ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
      <div className="space-y-4">
        {/* Header Row - Reference and Status */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{t("reference")}</p>
            <p className="font-mono font-semibold text-primary text-lg">{order.booking_reference}</p>
          </div>
          <Badge variant={order.payment_status === "confirmed" ? "default" : order.payment_status === "cancelled" ? "destructive" : "secondary"} className="font-lusail text-base px-4 py-1">
            {order.payment_status === "confirmed" ? t("confirmed") : order.payment_status === "cancelled" ? t("failed") : t("pending")}
          </Badge>
        </div>

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{t("customer")}</p>
            <p className="font-semibold">{order.customers.name}</p>
            <p className="text-xs text-muted-foreground">{order.customers.phone}</p>
            <p className="text-sm text-muted-foreground">{order.customers.email}</p>
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
            <div className="flex items-center gap-2">
              {order.payment_method === 'cash_pos' ? (
                <Banknote className="w-5 h-5 text-green-600" />
              ) : (
                <CreditCard className="w-5 h-5 text-blue-600" />
              )}
              <span className="font-medium capitalize">{order.payment_method}</span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap gap-2 pb-4 border-b">
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/tickets?ref=${order.booking_reference}`)} className="font-lusail flex items-center gap-2">
            <Printer className="w-4 h-4" />
            عرض التذاكر
          </Button>
          <Button size="sm" variant="outline" onClick={() => viewOrderDetails(order.id)} className="font-lusail flex items-center gap-2">
            <Eye className="w-4 h-4" />
            {t("viewDetails")}
          </Button>
          {order.payment_status === "pending" && (
            <Button 
              size="sm" 
              variant="default"
              onClick={() => togglePaymentStatus(order.id, order.payment_status)} 
              className="font-lusail flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4" />
              تأكيد الدفع ✓
            </Button>
          )}
          {order.payment_status === "confirmed" && (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => togglePaymentStatus(order.id, order.payment_status)} 
              className="font-lusail flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              إلغاء التأكيد
            </Button>
          )}
          {order.payment_status === "cancelled" && (
            <Button 
              size="sm" 
              variant="default"
              onClick={() => togglePaymentStatus(order.id, order.payment_status)} 
              className="font-lusail flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4" />
              تغيير إلى نجح
            </Button>
          )}
        </div>

        {/* Event & Booking Info */}
        <div className="space-y-2">
          {order.events && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="font-semibold text-primary">تاريخ الفعالية:</span>
              <span className="font-medium">
                {format(new Date(order.events.event_date), 'dd/MM/yyyy')}
              </span>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>تاريخ الحجز: {format(new Date(order.created_at), 'dd/MM/yyyy - HH:mm')}</span>
            </div>
            {order.events && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{order.events.location}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Sadad Verification Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Badge 
            variant={order.sadad_manually_verified ? "default" : "secondary"}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const { error } = await supabase
                  .from("orders")
                  .update({ sadad_manually_verified: !order.sadad_manually_verified })
                  .eq("id", order.id);
                
                if (error) throw error;
                toast.success(order.sadad_manually_verified ? "تم إلغاء التأكد من الدفع" : "تم التأكد من الدفع في سداد");
                onRefresh();
              } catch (error) {
                console.error("Error updating verification status:", error);
                toast.error("فشل في تحديث حالة التأكد");
              }
            }}
            className={`font-lusail text-sm px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity ${
              order.sadad_manually_verified 
                ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            title={order.sadad_manually_verified ? "اضغط لإلغاء التأكد" : "اضغط للتأكد من الدفع"}
          >
            {order.sadad_manually_verified ? (
              <>
                <CheckCircle className="w-4 h-4 mr-1 inline" />
                تم التأكد من الدفع في سداد ✓
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-1 inline" />
                إضغط هنا لتاكيد سداد
              </>
            )}
          </Badge>
          {showDeleteButton && (
            <Button 
              size="icon" 
              variant="destructive" 
              onClick={(e) => {
                e.stopPropagation();
                console.log("Delete button clicked for order:", order.id);
                setOrderToDelete(order.id);
              }}
              className="h-9 w-9"
              title="حذف الطلب"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>;
  const filteredOrders = filterOrders(activeTab);
  
  // Calculate stats from filtered orders (excluding those waiting for manual verification)
  const ordersForStats = orders.filter(o => !(o.sadad_manually_verified && o.payment_status === 'pending'));
  const stats = {
    success: ordersForStats.filter(o => o.payment_status === "confirmed").length,
    failed: ordersForStats.filter(o => o.payment_status === "cancelled").length,
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 bg-green-50 dark:bg-green-950">
          <h3 className="text-sm text-muted-foreground mb-2">{t("successfulPaymentsCount")}</h3>
          <p className="text-3xl font-bold text-green-600">{stats.success}</p>
        </Card>
        <Card className="p-6 bg-red-50 dark:bg-red-950">
          <h3 className="text-sm text-muted-foreground mb-2">{t("failedPayments")}</h3>
          <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
        </Card>
      </div>

      {/* Orders Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <TabsList className="grid grid-cols-2 font-lusail">
            <TabsTrigger value="success">{t("success")} ({stats.success})</TabsTrigger>
            <TabsTrigger value="failed">{t("failed")} ({stats.failed})</TabsTrigger>
          </TabsList>
          
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ابحث بالرقم المرجعي، الاسم أو رقم الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 font-lusail"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="font-lusail"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="font-lusail"
            >
              <Grid3x3 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <TabsContent value={activeTab} className="mt-6">
          {filteredOrders.length === 0 ? <Card className="p-12 text-center">
              <p className="text-muted-foreground font-lusail">{t("noOrders")}</p>
            </Card> : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            )}
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