import { useEffect, useState } from "react";
import { useNavigate, Outlet, NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  ShoppingCart,
  Calendar,
  Ticket,
  Settings,
  ExternalLink,
  Image,
  ScanLine,
  Users,
  CreditCard,
  FileText,
  Eye,
  Receipt,
  UserCog,
  Menu,
  X,
  ArrowLeftRight,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CapacityAlert } from "@/components/admin/CapacityAlert";
import { cn } from "@/lib/utils";

import "../i18n/config";

const AdminDashboard = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) setLogoUrl(data.logo_url);
    if (data?.header_bg_color) setHeaderBgColor(data.header_bg_color);
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/admin/login");
    }
  };

  useEffect(() => {
    checkAuth();
    fetchSettings().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const mainNav = [
    { to: "/admin/dashboard/notifications", label: "الإشعارات", icon: Bell },
    { to: "/admin/dashboard/orders", label: t("orders"), icon: ShoppingCart },
    { to: "/admin/dashboard/customers", label: "العملاء", icon: Users },
    { to: "/admin/dashboard/transactions", label: "المعاملات", icon: ArrowLeftRight },
    { to: "/admin/dashboard/events", label: t("events"), icon: Calendar },
    { to: "/admin/dashboard/tickets", label: t("tickets"), icon: Ticket },
    { to: "/admin/dashboard/invoices", label: "إرسال الفواتير", icon: FileText },
    { to: "/admin/dashboard/payment-errors", label: "أخطاء الدفع", icon: AlertTriangle },
  ];

  const settingsNav = [
    { to: "/admin/dashboard/settings", label: "الإعدادات العامة", icon: Settings },
    { to: "/admin/dashboard/pos-users", label: "مستخدمي POS", icon: UserCog },
    { to: "/admin/dashboard/visitors", label: "الزوار النشطون", icon: Eye },
    { to: "/admin/dashboard/reports", label: "التقارير", icon: FileText },
    { to: "/admin/dashboard/activity-logs", label: "سجلات النشاط", icon: FileText },
  ];

  const quickActions = [
    { label: "نقاط البيع", icon: CreditCard, onClick: () => window.open("/admin/pos", "_blank") },
    { label: t("scanTicket") || "مسح التذكرة", icon: ScanLine, onClick: () => navigate("/admin/qr-scanner") },
    { label: "قراءة إيصال POS", icon: Receipt, onClick: () => navigate("/admin/pos-receipts") },
    { label: t("liveBookings"), icon: ExternalLink, onClick: () => window.open("/live-bookings", "_blank") },
    { label: "الزوار المباشرون", icon: Eye, onClick: () => window.open("/live-visitors", "_blank") },
    { label: t("mainWebsite"), icon: ExternalLink, onClick: () => window.open("/", "_blank") },
  ];

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
      isActive
        ? "bg-primary text-primary-foreground shadow-[var(--shadow-elegant)]"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  const NavSections = () => (
    <nav className="space-y-6">
      <div>
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          الإدارة
        </p>
        <div className="space-y-1">
          {mainNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navItemClass}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div>
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          {t("settings")}
        </p>
        <div className="space-y-1">
          {settingsNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navItemClass}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div>
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          روابط سريعة
        </p>
        <div className="space-y-1">
          {quickActions.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ backgroundColor: headerBgColor }}
      >
        <div className="mx-auto flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="القائمة"
            >
              {mobileNavOpen ? <Menu className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <button
              onClick={() => navigate("/")}
              className="focus:outline-none transition-opacity hover:opacity-80"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 object-contain sm:h-10 md:h-12" />
              ) : (
                <h1 className="text-lg font-bold sm:text-xl md:text-2xl">{t("adminDashboard")}</h1>
              )}
            </button>
          </div>
          <Button variant="outline" onClick={handleLogout} className="text-xs sm:text-sm">
            <LogOut className="ml-1 h-3 w-3 sm:ml-2 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">{t("logout")}</span>
            <span className="sm:hidden">خروج</span>
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-72 shrink-0 overflow-y-auto border-l bg-sidebar/60 px-4 py-6 backdrop-blur-sm lg:block">
          <NavSections />
        </aside>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute inset-y-0 right-0 w-72 max-w-[85vw] overflow-y-auto border-l bg-background px-4 py-5 shadow-[var(--shadow-elegant)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">القائمة</span>
                <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <NavSections />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 md:py-8">
          <div className="mx-auto max-w-7xl">
            <CapacityAlert />
            {loading ? (
              <div className="py-12 text-center">{t("loading")}</div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
