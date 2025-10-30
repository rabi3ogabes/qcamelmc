import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LogOut, ShoppingCart, Calendar, Ticket, Settings, ExternalLink, Image, ScanLine, Users, CreditCard, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { EventsTab } from "@/components/admin/EventsTab";
import { TicketsTab } from "@/components/admin/TicketsTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { PopupBannersTab } from "@/components/admin/PopupBannersTab";
import { CustomersTab } from "@/components/admin/CustomersTab";
import { SadadVerificationTab } from "@/components/admin/SadadVerificationTab";
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
  events: { title: string; event_date: string; location: string };
}

const AdminDashboard = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    fetchOrders();
    fetchSettings();

    // Subscribe to real-time order changes
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          console.log('Order changed, refreshing...');
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }
  };

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
        .select("*, customers(name, email, phone), events(title, event_date, location)")
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
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            ) : (
              <h1 className="text-2xl font-bold">{t("adminDashboard")}</h1>
            )}
          </button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 ml-2" />
            {t("logout")}
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-8 px-4">

        {/* Main Content */}
        {loading ? (
          <div className="text-center py-12">{t("loading")}</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-8">
              <TabsTrigger value="orders" className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                {t("orders")}
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                العملاء
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

            <div className="flex justify-center mb-6 gap-2">
              <Button
                variant="outline"
                onClick={() => window.open('/admin/pos', '_blank')}
                className="font-lusail flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border-primary"
              >
                <CreditCard className="w-4 h-4" />
                نقاط البيع
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/admin/qr-scanner')}
                className="font-lusail flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border-primary"
              >
                <ScanLine className="w-4 h-4" />
                {t("scanTicket") || "مسح التذكرة"}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/live-bookings', '_blank')}
                className="font-lusail flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                {t("liveBookings")}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/', '_blank')}
                className="font-lusail flex items-center gap-2"
                title={t("openMainWebsite")}
              >
                <ExternalLink className="w-4 h-4" />
                {t("mainWebsite")}
              </Button>
            </div>

            <TabsContent value="orders">
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="all" className="font-lusail">
                    جميع الطلبات
                  </TabsTrigger>
                  <TabsTrigger value="sadad-verification" className="flex items-center gap-2 font-lusail">
                    <ShieldCheck className="w-4 h-4" />
                    التاكد من الدفع في سداد
                    {orders.filter(o => o.payment_method === "sadad" && (o as any).sadad_manually_verified === true).length > 0 && (
                      <Badge variant="destructive" className="mr-2">
                        {orders.filter(o => o.payment_method === "sadad" && (o as any).sadad_manually_verified === true).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="all">
                  <OrdersTab 
                    orders={orders} 
                    onRefresh={fetchOrders}
                  />
                </TabsContent>

                <TabsContent value="sadad-verification">
                  <SadadVerificationTab onRefresh={fetchOrders} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="customers">
              <CustomersTab />
            </TabsContent>

            <TabsContent value="events">
              <EventsTab />
            </TabsContent>

            <TabsContent value="tickets">
              <TicketsTab />
            </TabsContent>

            <TabsContent value="settings">
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="general" className="font-lusail">
                    الإعدادات العامة
                  </TabsTrigger>
                  <TabsTrigger value="popups" className="flex items-center gap-2 font-lusail">
                    <Image className="w-4 h-4" />
                    إعلانات البوب أب
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                  <SettingsTab />
                </TabsContent>

                <TabsContent value="popups">
                  <PopupBannersTab />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
