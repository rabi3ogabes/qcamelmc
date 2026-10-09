import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import UnifiedLoginCard from "@/components/auth/UnifiedLoginCard";

const AdminLogin = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const navigate = useNavigate();
  const location = useLocation();
  // A `next` query param (used by the agent-integration consent flow) wins over
  // the guard's router state; both must be same-origin relative paths.
  const nextParam = new URLSearchParams(location.search).get("next");
  const intendedPath =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : (location.state as { from?: string } | null)?.from;

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
        <UnifiedLoginCard intendedPath={intendedPath} defaultTab="passcode" showHomeLink />
      </div>
    </div>
  );
};

export default AdminLogin;
