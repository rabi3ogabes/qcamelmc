import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, MapPin, Calendar, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TicketHolder {
  id: string;
  name: string;
  phone: string;
  nationality: string;
  ticket_type: string;
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
}

interface OrdersTabProps {
  orders: Order[];
  onRefresh: () => void;
}

export const OrdersTab = ({ orders, onRefresh }: OrdersTabProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);

  const viewOrderDetails = async (orderId: string) => {
    setSelectedOrder(orderId);
    try {
      const { data, error } = await supabase
        .from("ticket_holders")
        .select("*")
        .eq("order_id", orderId);

      if (error) throw error;
      setTicketHolders(data || []);
    } catch (error) {
      console.error("Error fetching ticket holders:", error);
      toast.error(t("failedToLoad"));
    }
  };

  const confirmPayment = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "confirmed" })
        .eq("id", orderId);

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

  const OrderCard = ({ order }: { order: Order }) => (
    <Card className="p-6 hover:shadow-lg transition-shadow">
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
            {order.ticket_type === "vip" ? t("vipAccess") : 
             order.ticket_type === "normal" ? t("generalAdmission") : 
             t("parking")} × {order.quantity}
          </p>
          <p className="text-sm font-semibold text-primary">{order.total_amount.toFixed(2)} {t("qar")}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("paymentMethod")}</p>
          <p className="font-medium capitalize">{order.payment_method}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t("status")}</p>
          <Badge 
            variant={
              order.payment_status === "confirmed" ? "default" : 
              order.payment_status === "failed" ? "destructive" : 
              "secondary"
            }
            className="font-lusail"
          >
            {order.payment_status === "confirmed" ? t("confirmed") :
             order.payment_status === "failed" ? t("failed") :
             t("pending")}
          </Badge>
        </div>
        
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => viewOrderDetails(order.id)} 
            className="font-lusail flex items-center gap-2"
          >
            {t("viewDetails")}
            <Eye className="w-4 h-4" />
          </Button>
          {order.payment_status === "pending" && (
            <Button size="sm" onClick={() => confirmPayment(order.id)} className="font-lusail flex items-center gap-2">
              {t("confirmPayment")}
              <CheckCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {new Date(order.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Qatar'
          })} - {new Date(order.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Qatar'
          })} (Qatar Time)
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="w-4 h-4" />
          <span>قطر</span>
        </div>
      </div>
    </Card>
  );

  const filteredOrders = filterOrders(activeTab);
  const stats = {
    total: orders.length,
    success: orders.filter(o => o.payment_status === "confirmed").length,
    failed: orders.filter(o => o.payment_status === "failed").length,
    pending: orders.filter(o => o.payment_status === "pending").length,
  };

  return (
    <div className="space-y-6">
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
          {filteredOrders.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground font-lusail">{t("noOrders")}</p>
            </Card>
          ) : (
            filteredOrders.map((order) => <OrderCard key={order.id} order={order} />)
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
            {ticketHolders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-lusail">#</TableHead>
                    <TableHead className="text-right font-lusail">{t("holderName")}</TableHead>
                    <TableHead className="text-right font-lusail">{t("holderPhone")}</TableHead>
                    <TableHead className="text-right font-lusail">{t("holderNationality")}</TableHead>
                    <TableHead className="text-right font-lusail">{t("ticketType")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketHolders.map((holder, index) => (
                    <TableRow key={holder.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-medium">{holder.name}</TableCell>
                      <TableCell>{holder.phone}</TableCell>
                      <TableCell>{holder.nationality}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize font-lusail">
                          {holder.ticket_type}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8 font-lusail">
                {t("noTicketHolders")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
