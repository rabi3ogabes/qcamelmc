import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Lock, KeyRound, ShieldCheck } from "lucide-react";
import { grantStaffAccess } from "@/lib/staffAccess";

interface UnifiedLoginCardProps {
  /** Where an admin should land after a successful account sign-in. */
  intendedPath?: string;
  /** Called after the staff passcode is accepted (used by the inline route guard). */
  onPasscodeSuccess?: () => void;
  /** Show the "back to home" link (login page only). */
  showHomeLink?: boolean;
}

/**
 * Single luxury login surface used by both the /admin/login page and the route guard:
 * account sign-in (admin + moderator) and the shared staff passcode live in one card.
 */
const UnifiedLoginCard = ({
  intendedPath,
  onPasscodeSuccess,
  showHomeLink = false,
}: UnifiedLoginCardProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Warm up the passcode check function in the background so the real
  // verification responds instantly (the first call otherwise waits on a cold start).
  useEffect(() => {
    supabase.functions
      .invoke("staff-auth", { body: { passcode: "__warmup__" } })
      .catch(() => {});
  }, []);

  const signInAndRoute = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const roles = (roleRows || []).map((r: { role: string }) => r.role);

      // Moderators only ever get the quick-links page — never the dashboard.
      if (roles.includes("moderator") && !roles.includes("admin")) {
        toast.success("تم تسجيل الدخول");
        navigate("/staff", { replace: true });
        return;
      }

      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!adminUser && !roles.includes("admin")) {
        await supabase.auth.signOut();
        throw new Error("غير مصرح: الدخول للأدمن فقط");
      }

      toast.success("تم تسجيل الدخول");
      const target =
        intendedPath && intendedPath.startsWith("/admin") ? intendedPath : "/admin/dashboard";
      navigate(target, { replace: true });
    } catch (error: any) {
      toast.error(error.message || "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await signInAndRoute(email, password);
  };

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
        toast.success("تم فتح الصفحة");
        if (onPasscodeSuccess) onPasscodeSuccess();
        else navigate("/staff", { replace: true });
      } else {
        toast.error("كلمة المرور غير صحيحة");
      }
    } catch {
      toast.error("تعذر التحقق من كلمة المرور");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card
      dir="rtl"
      className="w-full max-w-md overflow-hidden border-border/60 bg-card/80 p-0 shadow-[var(--shadow-elegant)] backdrop-blur-xl"
    >
      <div className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent px-8 py-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          دخول موحّد للأدمن والمشرفين وفريق العمل
        </p>
      </div>

      <div className="p-6 sm:p-8">
        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="account" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              حساب
            </TabsTrigger>
            <TabsTrigger value="passcode" className="gap-2">
              <KeyRound className="h-4 w-4" />
              كلمة مرور الفريق
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "جاري الدخول..." : "دخول"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                يتم توجيهك تلقائياً حسب صلاحيتك: الأدمن للوحة التحكم، والمشرف للروابط السريعة.
              </p>
            </form>
          </TabsContent>

          <TabsContent value="passcode" className="mt-6">
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staff-pass">كلمة مرور الفريق</Label>
                <Input
                  id="staff-pass"
                  type="password"
                  dir="ltr"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={verifying}>
                {verifying ? "جاري التحقق..." : "فتح الصفحة"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                تبقى الصلاحية فعّالة لمدة ١٠ أيام في هذا المتصفح، ثم تُطلب كلمة المرور من جديد.
              </p>

            </form>
          </TabsContent>
        </Tabs>

        {showHomeLink && (
          <Button variant="ghost" className="mt-6 w-full" onClick={() => navigate("/")}>
            ← العودة للرئيسية
          </Button>
        )}
      </div>
    </Card>
  );
};

export default UnifiedLoginCard;
