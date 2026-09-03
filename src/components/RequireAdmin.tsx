import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { getStaffPasscode, grantStaffAccess, hasStaffAccess } from "@/lib/staffAccess";



/**
 * Guards staff-only routes: allows a signed-in admin, or anyone who enters the staff passcode.
 * With `adminOnly`, moderators are sent to their short quick-links page instead.
 */
const RequireAdmin = ({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) => {
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const [passcode, setPasscode] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const check = async () => {
      // Staff access counts only when the accepted passcode is stored,
      // so staff-only edge functions can still authorize the request.
      if (hasStaffAccess() && getStaffPasscode()) {
        if (active) setStatus("allowed");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) setStatus("denied");
        return;
      }

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const roles = (roleRows || []).map((r: { role: string }) => r.role);

      if (roles.includes("moderator") && !roles.includes("admin")) {
        if (!active) return;
        if (adminOnly) {
          navigate("/staff", { replace: true });
          return;
        }
        setStatus("allowed");
        return;
      }

      if (roles.includes("admin")) {
        if (active) setStatus("allowed");
        return;
      }

      const { data } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();
      if (active) setStatus(data ? "allowed" : "denied");
    };


    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, adminOnly]);

  const [verifying, setVerifying] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-auth", {
        body: { passcode },
      });
      if (error) throw error;
      if (data?.ok) {
        grantStaffAccess(passcode);
        setStatus("allowed");
        toast.success("تم فتح الصفحة");
      } else {
        toast.error("كلمة المرور غير صحيحة");
      }
    } catch {
      toast.error("تعذر التحقق من كلمة المرور");
    } finally {
      setVerifying(false);
    }
  };


  if (status === "checking") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background" dir="rtl">
        <UnifiedLoginCard
          intendedPath={location.pathname}
          onPasscodeSuccess={() => setStatus("allowed")}
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAdmin;
