import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users } from "lucide-react";
import UnifiedLoginCard from "@/components/auth/UnifiedLoginCard";

const AdminLogin = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const intendedPath = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("public_settings")
        .select("logo_url, header_bg_color")
        .maybeSingle();

      if (error) {
        console.error("Error fetching settings:", error);
        return;
      }
      if (data?.logo_url) setLogoUrl(data.logo_url);
      if (data?.header_bg_color) setHeaderBgColor(data.header_bg_color);
    };
    fetchSettings();
  }, []);

  const demoLogin = async () => {
    setDemoLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: "rabii.souai@gmail.com",
        password: "@@@Qatar123",
      });
      if (error) throw error;
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const roles = (roleRows || []).map((r: { role: string }) => r.role);
      toast.success("تم تسجيل الدخول");
      navigate(
        roles.includes("moderator") && !roles.includes("admin") ? "/staff" : "/admin/dashboard",
        { replace: true }
      );
    } catch (error: any) {
      toast.error(error.message || "تعذر تسجيل الدخول");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-sm"
        style={{ backgroundColor: headerBgColor }}
      >
        <div className="container mx-auto flex items-center justify-center px-4 py-4">
          <button
            onClick={() => navigate("/")}
            className="transition-opacity hover:opacity-80 focus:outline-none"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-[53px] object-contain" />
            ) : (
              <h1 className="text-2xl font-bold">تسجيل الدخول</h1>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center px-4 py-14">
        <UnifiedLoginCard intendedPath={intendedPath} showHomeLink />

        <div className="mt-6 grid w-full max-w-md gap-3">
          <Button variant="outline" className="w-full text-sm" onClick={() => navigate("/staff")}>
            <Users className="ms-2 h-4 w-4" />
            الدخول كفريق / روابط سريعة
          </Button>
          <Button
            variant="ghost"
            className="w-full text-sm text-muted-foreground"
            onClick={demoLogin}
            disabled={demoLoading}
          >
            {demoLoading ? "..." : "(-_-)"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
