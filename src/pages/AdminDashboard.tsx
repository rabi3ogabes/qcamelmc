import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LogOut, ShoppingCart, Calendar, Ticket, Settings, ExternalLink, Image, ScanLine, Users, CreditCard, FileText, Eye, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { EventsTab } from "@/components/admin/EventsTab";
import { TicketsTab } from "@/components/admin/TicketsTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { PopupBannersTab } from "@/components/admin/PopupBannersTab";
import { CustomersTab } from "@/components/admin/CustomersTab";
import { InvoiceTab } from "@/components/admin/InvoiceTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { ActivityLogsTab } from "@/components/admin/ActivityLogsTab";
import { VisitorAnalyticsTab } from "@/components/admin/VisitorAnalyticsTab";

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
  event_id: string;
  payment_error_reason?: string | null;
  customers: { name: string; email: string; phone: string; nationality?: string };
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
    const initDashboard = async () => {
      await Promise.all([fetchOrders(), fetchSettings()]);
    };
    initDashboard();

    // Subscribe to real-time order changes with debouncing
    let refreshTimeout: NodeJS.Timeout;
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
          clearTimeout(refreshTimeout);
          refreshTimeout = setTimeout(() => {
            fetchOrders();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(refreshTimeout);
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

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, email, phone, nationality), events(title, event_date, location), payment_error_reason")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-between items-center gap-2">
          <button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 sm:h-10 md:h-12 object-contain" />
            ) : (
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold">{t("adminDashboard")}</h1>
            )}
          </button>
          <Button variant="outline" onClick={handleLogout} className="text-xs sm:text-sm">
            <LogOut className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
            <span className="hidden sm:inline">{t("logout")}</span>
            <span className="sm:hidden">خروج</span>
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-4 sm:py-6 md:py-8 px-3 sm:px-4">

        {/* Main Content */}
        {loading ? (
          <div className="text-center py-12">{t("loading")}</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-6 sm:mb-8 h-auto gap-2">
              <TabsTrigger value="orders" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("orders")}</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">العملاء</span>
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("events")}</span>
              </TabsTrigger>
              <TabsTrigger value="tickets" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                <Ticket className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("tickets")}</span>
              </TabsTrigger>
              <TabsTrigger value="invoices" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">إرسال الفواتير</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("settings")}</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center mb-6 gap-2">
              <Button
                variant="outline"
                onClick={() => window.open('/admin/pos', '_blank')}
                className="font-lusail flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border-primary text-xs sm:text-sm w-full sm:w-auto"
              >
                <CreditCard className="w-4 h-4" />
                نقاط البيع
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/admin/qr-scanner')}
                className="font-lusail flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border-primary text-xs sm:text-sm w-full sm:w-auto"
              >
                <ScanLine className="w-4 h-4" />
                {t("scanTicket") || "مسح التذكرة"}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/live-bookings', '_blank')}
                className="font-lusail flex items-center justify-center gap-2 text-xs sm:text-sm w-full sm:w-auto"
              >
                <ExternalLink className="w-4 h-4" />
                {t("liveBookings")}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/live-visitors', '_blank')}
                className="font-lusail flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border-green-500 text-green-600 dark:text-green-400 text-xs sm:text-sm w-full sm:w-auto"
              >
                <Eye className="w-4 h-4" />
                الزوار المباشرون
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/', '_blank')}
                className="font-lusail flex items-center justify-center gap-2 text-xs sm:text-sm w-full sm:w-auto"
                title={t("openMainWebsite")}
              >
                <ExternalLink className="w-4 h-4" />
                {t("mainWebsite")}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/admin/pos-receipts')}
                className="font-lusail flex items-center justify-center gap-2 bg-orange-500/10 hover:bg-orange-500/20 border-orange-500 text-orange-600 dark:text-orange-400 text-xs sm:text-sm w-full sm:w-auto"
              >
                <Receipt className="w-4 h-4" />
                قراءة إيصال POS
              </Button>
            </div>

            <TabsContent value="orders">
              <OrdersTab 
                orders={orders} 
                onRefresh={fetchOrders}
              />
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

            <TabsContent value="invoices">
              <InvoiceTab />
            </TabsContent>

            <TabsContent value="settings">
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 mb-6 gap-2 h-auto">
                  <TabsTrigger value="general" className="font-lusail text-xs sm:text-sm">
                    الإعدادات العامة
                  </TabsTrigger>
                  <TabsTrigger value="visitors" className="flex items-center gap-2 font-lusail text-xs sm:text-sm">
                    <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                    الزوار النشطون
                  </TabsTrigger>
                  <TabsTrigger value="popups" className="flex items-center gap-2 font-lusail text-xs sm:text-sm">
                    <Image className="w-3 h-3 sm:w-4 sm:h-4" />
                    إعلانات البوب أب
                  </TabsTrigger>
                  <TabsTrigger value="reports" className="flex items-center gap-2 font-lusail text-xs sm:text-sm">
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                    التقارير
                  </TabsTrigger>
                  <TabsTrigger value="activity_logs" className="flex items-center gap-2 font-lusail text-xs sm:text-sm">
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                    سجلات النشاط
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                  <SettingsTab />
                </TabsContent>

                <TabsContent value="visitors">
                  <VisitorAnalyticsTab />
                </TabsContent>

                <TabsContent value="popups">
                  <PopupBannersTab />
                </TabsContent>

                <TabsContent value="reports">
                  <ReportsTab />
                </TabsContent>

                <TabsContent value="activity_logs">
                  <ActivityLogsTab />
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
