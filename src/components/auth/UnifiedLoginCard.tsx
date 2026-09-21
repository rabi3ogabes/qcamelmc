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
  /** Which tab opens by default ("account" | "passcode"). */
  defaultTab?: "account" | "passcode";
}

/**
 * Single luxury login surface used by both the /admin/login page and the route guard:
 * account sign-in (admin + moderator) and the shared staff passcode live in one card.
 */
const UnifiedLoginCard = ({
  intendedPath,
  onPasscodeSuccess,
  showHomeLink = false,
  defaultTab = "account",
}: UnifiedLoginCardProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  /** Seconds remaining on a temporary lock after too many failed attempts. */
  const [lockSeconds, setLockSeconds] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  // Warm up the passcode check function in the background so the real
  // verification responds instantly (the first call otherwise waits on a cold start).
  useEffect(() => {
    supabase.functions
      .invoke("staff-auth", { body: { passcode: "__warmup__" } })
      .catch(() => {});
  }, []);

  // Countdown for the temporary lock.
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const id = window.setInterval(
      () => setLockSeconds((s) => (s <= 1 ? 0 : s - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [lockSeconds]);

  const lockLabel = (() => {
    const m = Math.floor(lockSeconds / 60);
    const s = lockSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  })();

  const guard = async (payload: Record<string, unknown>) => {
    try {
      const { data } = await supabase.functions.invoke("login-guard", { body: payload });
      return (data ?? {}) as {
        allowed?: boolean;
        blocked?: boolean;
        retry_after_seconds?: number;
        attempts_left?: number;
      };
    } catch {
      return {};
    }
  };

  /** Returns false when the attempt is currently blocked. */
  const ensureNotBlocked = async (identifier: string, kind: "account" | "passcode") => {
    const res = await guard({ mode: "check", identifier, kind });
    if (res.blocked) {
      setLockSeconds(res.retry_after_seconds || 1800);
      toast.error("تم إيقاف المحاولات مؤقتاً بسبب تكرار الأخطاء");
      return false;
    }
    return true;
  };

  const recordAttempt = async (
    identifier: string,
    kind: "account" | "passcode",
    success: boolean,
  ) => {
    const res = await guard({ mode: "record", identifier, kind, success });
    if (success) {
      setAttemptsLeft(null);
      setLockSeconds(0);
      return;
    }
    if (res.blocked) setLockSeconds(res.retry_after_seconds || 1800);
    else if (typeof res.attempts_left === "number") setAttemptsLeft(res.attempts_left);
  };

  const signInAndRoute = async (loginEmail: string, loginPassword: string) => {
    if (lockSeconds > 0) return;
    setLoading(true);
    try {
      if (!(await ensureNotBlocked(loginEmail, "account"))) return;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) {
        await recordAttempt(loginEmail, "account", false);
        throw error;
      }

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const roles = (roleRows || []).map((r: { role: string }) => r.role);

      // Moderators only ever get the quick-links page — never the dashboard.
      if (roles.includes("moderator") && !roles.includes("admin")) {
        await recordAttempt(loginEmail, "account", true);
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
        await recordAttempt(loginEmail, "account", false);
        throw new Error("غير مصرح: الدخول للأدمن فقط");
      }

      await recordAttempt(loginEmail, "account", true);
      toast.success("تم تسجيل الدخول");
      // Only same-origin relative paths are honoured as a return target.
      const safePath =
        intendedPath && intendedPath.startsWith("/") && !intendedPath.startsWith("//")
          ? intendedPath
          : undefined;
      navigate(safePath ?? "/admin/dashboard", { replace: true });

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
    if (lockSeconds > 0) return;
    setVerifying(true);
    try {
      if (!(await ensureNotBlocked("team-passcode", "passcode"))) return;

      const { data, error } = await supabase.functions.invoke("staff-auth", {
        body: { passcode },
      });
      if (error) throw error;
      if (data?.ok) {
        await recordAttempt("team-passcode", "passcode", true);
        grantStaffAccess(passcode);
        toast.success("تم فتح الصفحة");
        if (onPasscodeSuccess) onPasscodeSuccess();
        else navigate("/staff", { replace: true });
      } else {
        await recordAttempt("team-passcode", "passcode", false);
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
        {lockSeconds > 0 && (
          <div className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center">
            <p className="text-sm font-semibold text-destructive">
              تم إيقاف المحاولات مؤقتاً
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              حاول مجدداً بعد <span dir="ltr">{lockLabel}</span> — تم إشعار الإدارة.
            </p>
          </div>
        )}
        {lockSeconds === 0 && attemptsLeft !== null && attemptsLeft <= 2 && (
          <p className="mb-4 text-center text-xs text-destructive">
            تبقّت {attemptsLeft} محاولة قبل الإيقاف المؤقت
          </p>
        )}
        <Tabs defaultValue={defaultTab} className="w-full">

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
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || lockSeconds > 0}
              >
                {lockSeconds > 0 ? `موقوف مؤقتاً (${lockLabel})` : loading ? "جاري الدخول..." : "دخول"}
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
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={verifying || lockSeconds > 0}
              >
                {lockSeconds > 0
                  ? `موقوف مؤقتاً (${lockLabel})`
                  : verifying
                  ? "جاري التحقق..."
                  : "فتح الصفحة"}
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
