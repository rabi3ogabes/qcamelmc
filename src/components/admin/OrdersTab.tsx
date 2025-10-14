import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, MapPin, Calendar, Eye, QrCode, Loader2, XCircle, Printer } from "lucide-react";
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
  const filterOrders = (status: string) => {
    if (status === "all") return orders;
    if (status === "success") return orders.filter(o => o.payment_status === "confirmed");
    if (status === "failed") return orders.filter(o => o.payment_status === "failed");
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
          <Badge variant={order.payment_status === "confirmed" ? "default" : order.payment_status === "failed" ? "destructive" : "secondary"} className="font-lusail">
            {order.payment_status === "confirmed" ? t("confirmed") : order.payment_status === "failed" ? t("failed") : t("pending")}
          </Badge>
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
          {order.payment_status === "pending" && <Button size="sm" onClick={() => confirmPayment(order.id)} className="font-lusail flex items-center justify-center gap-2">
              {t("confirmPayment")}
              <CheckCircle className="w-4 h-4" />
            </Button>}
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
            <span className="text-muted-foreground">
              ({format(new Date(order.events.event_date), 'HH:mm')})
            </span>
          </div>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
      </div>
    </Card>;
  const filteredOrders = filterOrders(activeTab);
  const stats = {
    total: orders.length,
    success: orders.filter(o => o.payment_status === "confirmed").length,
    failed: orders.filter(o => o.payment_status === "failed").length,
    pending: orders.filter(o => o.payment_status === "pending").length
  };
  return <div className="space-y-6">
      {/* Generate QR Codes Button */}
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
    </div>;
};