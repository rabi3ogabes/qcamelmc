import { useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LiveBookings from "@/pages/LiveBookings";
import { fetchLiveFeed, getSavedLivePassword, LiveFeedError, saveLivePassword } from "@/lib/liveBookingsAccess";

/** Signed-in admins open the page directly; anyone else enters the screen password once per device. */
const LiveBookingsGate = () => {
  const [mode, setMode] = useState<"checking" | "admin" | "viewer" | "locked">("checking");
  const [password, setPassword] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
        const roles = (data || []).map((r: { role: string }) => r.role);
        const { data: adm } = await supabase.from("admin_users").select("id").eq("id", session.user.id).maybeSingle();
        if (roles.includes("admin") || adm) return setMode("admin");
      }
      const saved = getSavedLivePassword();
      if (saved) {
        try {
          await fetchLiveFeed(saved, "verify");
          setPassword(saved);
          return setMode("viewer");
        } catch { /* fall through */ }
      }
      setMode("locked");
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true); setMessage("");
    try {
      await fetchLiveFeed(input.trim(), "verify");
      saveLivePassword(input.trim());
      setPassword(input.trim());
      setMode("viewer");
    } catch (err) {
      const e2 = err as LiveFeedError;
      setMessage(
        e2.code === "blocked" ? `محاولات كثيرة — حاول بعد ${Math.ceil((e2.retryAfter ?? 1800) / 60)} دقيقة`
        : e2.code === "wrong_password" ? `كلمة المرور غير صحيحة${e2.attemptsLeft !== undefined ? ` — متبقي ${e2.attemptsLeft} محاولات` : ""}`
        : e2.code === "not_configured" ? "لم يتم تعيين كلمة مرور لهذه الصفحة بعد"
        : "تعذر الاتصال، حاول مرة أخرى"
      );
    } finally { setBusy(false); }
  };

  if (mode === "checking") {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  if (mode === "admin") return <LiveBookings />;
  if (mode === "viewer") return <LiveBookings viewerPassword={password} />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" dir="rtl">
      <Card className="w-full max-w-sm p-8 space-y-6 border-primary/30 shadow-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">الحجوزات المباشرة</h1>
          <p className="text-sm text-muted-foreground">أدخل كلمة مرور الشاشة مرة واحدة — ستُحفظ على هذا الجهاز</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input type="password" autoComplete="current-password" name="live-password" value={input}
            onChange={(e) => setInput(e.target.value)} placeholder="كلمة المرور" className="text-center" autoFocus />
          {message && <p className="text-sm text-destructive text-center">{message}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "دخول"}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default LiveBookingsGate;
