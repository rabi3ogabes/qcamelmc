import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AttendanceTab } from "@/components/admin/AttendanceTab";

const StaffAttendance = () => {
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("public_settings")
      .select("logo_url")
      .maybeSingle()
      .then(({ data }) => data?.logo_url && setLogoUrl(data.logo_url));
  }, []);

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      <header className="border-b bg-card/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          {logoUrl ? (
            <img src={logoUrl} alt="الشعار" className="h-10 object-contain" />
          ) : (
            <span className="text-lg font-bold">حضور الفريق</span>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/staff")}>
            <ArrowLeft className="ms-2 h-4 w-4" />
            رجوع
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <AttendanceTab />
      </main>
    </div>
  );
};

export default StaffAttendance;
