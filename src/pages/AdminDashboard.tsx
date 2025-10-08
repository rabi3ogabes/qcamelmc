import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, ShoppingCart, Calendar, Ticket, Settings, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { EventsTab } from "@/components/admin/EventsTab";
import { TicketsTab } from "@/components/admin/TicketsTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import "../i18n/config";

interface Order {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  customers: { name: string; email: string; phone: string };
}

const AdminDashboard = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    fetchOrders();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/admin/login");
    }
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, email, phone)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 font-lusail" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">{t("adminDashboard")}</h1>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 ml-2" />
            {t("logout")}
          </Button>
        </div>

        {/* Main Content */}
        {loading ? (
          <div className="text-center py-12">{t("loading")}</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="orders" className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                {t("orders")}
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {t("events")}
              </TabsTrigger>
              <TabsTrigger value="tickets" className="flex items-center gap-2">
                <Ticket className="w-4 h-4" />
                {t("tickets")}
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {t("settings")}
              </TabsTrigger>
            </TabsList>

            <div className="flex justify-center mb-6">
              <Button
                variant="outline"
                onClick={() => window.open('/live-bookings', '_blank')}
                className="font-lusail flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                {t("liveBookings")}
              </Button>
            </div>

            <TabsContent value="orders">
              <OrdersTab orders={orders} onRefresh={fetchOrders} />
            </TabsContent>

            <TabsContent value="events">
              <EventsTab />
            </TabsContent>

            <TabsContent value="tickets">
              <TicketsTab />
            </TabsContent>

            <TabsContent value="settings">
              <SettingsTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
