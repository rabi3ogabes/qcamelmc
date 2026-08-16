import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { grantStaffAccess, hasStaffAccess } from "@/lib/staffAccess";

const STAFF_PASSCODE = "@@@Qatar123";


/**
 * Guards staff-only routes: allows a signed-in admin, or anyone who enters the staff passcode.
 */
const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const [passcode, setPasscode] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const check = async () => {
      if (hasStaffAccess()) {
        if (active) setStatus("allowed");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) setStatus("denied");
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
  }, [location.pathname]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === STAFF_PASSCODE) {
      grantStaffAccess();

      setStatus("allowed");
      toast.success("تم فتح الصفحة");
    } else {
      toast.error("كلمة المرور غير صحيحة");
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
      <div className="min-h-screen flex items-center justify-center px-4 bg-background" dir="rtl">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">صفحة خاصة بالفريق</h1>
            <p className="text-muted-foreground text-sm">أدخل كلمة المرور للدخول، أو سجّل الدخول كمشرف</p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <Label htmlFor="staff-pass">كلمة المرور</Label>
              <Input
                id="staff-pass"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" size="lg">
              فتح الصفحة
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              onClick={() => navigate("/admin/login", { state: { from: location.pathname } })}
            >
              تسجيل دخول المشرف ←
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAdmin;
