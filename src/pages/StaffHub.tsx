import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreditCard, ScanLine, Receipt, ExternalLink, LogOut, ArrowLeft } from "lucide-react";
import { useStaffRole } from "@/hooks/useStaffRole";

const LINKS = [
  {
    label: "نقاط البيع",
    hint: "بيع التذاكر مباشرة",
    icon: CreditCard,
    to: "/admin/pos",
  },
  {
    label: "مسح التذكرة",
    hint: "تسجيل دخول الحضور بالكاميرا",
    icon: ScanLine,
    to: "/admin/qr-scanner",
  },
  {
    label: "الحجوزات المباشرة",
    hint: "متابعة الحجوزات لحظة بلحظة",
    icon: ExternalLink,
    to: "/live-bookings",
  },
  {
    label: "قراءة إيصال POS",
    hint: "تحويل الإيصال إلى بيانات",
    icon: Receipt,
    to: "/admin/pos-receipts",
  },
];

const StaffHub = () => {
  const navigate = useNavigate();
  const { role } = useStaffRole();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("public_settings")
      .select("logo_url")
      .maybeSingle()
      .then(({ data }) => data?.logo_url && setLogoUrl(data.logo_url));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      <header className="border-b bg-card/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          {logoUrl ? (
            <img src={logoUrl} alt="الشعار" className="h-10 object-contain" />
          ) : (
            <span className="text-lg font-bold">لوحة الفريق</span>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="ms-2 h-4 w-4" />
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            روابط سريعة
          </p>
          <h1 className="mt-2 text-3xl font-bold">أهلاً بك</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            اختر المهمة التي تريد البدء بها
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {LINKS.map(({ label, hint, icon: Icon, to }) => (
            <Card
              key={to}
              onClick={() => window.open(to, "_blank", "noopener,noreferrer")}
              className="group relative cursor-pointer overflow-hidden border-border/70 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elegant)]"
            >
              <span className="absolute inset-y-0 right-0 w-1 bg-primary/70 opacity-70 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center gap-4 ps-1">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{hint}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />
              </div>
            </Card>
          ))}
        </div>

        {role === "admin" && (
          <div className="mt-8 text-center">
            <Button variant="ghost" onClick={() => navigate("/admin/dashboard")}>
              الذهاب إلى لوحة التحكم الكاملة ←
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default StaffHub;
