import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldCheck, UserPlus, Trash2, KeyRound } from "lucide-react";

type StaffUser = { user_id: string; role: "admin" | "moderator"; email: string };

/** Admin-only card: create moderators and switch staff roles. */
export const StaffRolesCard = () => {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-staff-users", { body });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.message || "فشل الإجراء");
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await call({ action: "list" });
      setUsers(data.users || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await call({ action: "create", email, password, role: "moderator" });
      toast.success("تم إنشاء حساب المشرف المساعد");
      setEmail("");
      setPassword("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setRole = async (userId: string, role: "admin" | "moderator") => {
    try {
      await call({ action: "set_role", userId, role });
      toast.success("تم تحديث الصلاحية");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const revoke = async (userId: string) => {
    try {
      await call({ action: "revoke", userId });
      toast.success("تم سحب الصلاحية");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const resetPassword = async (userId: string, staffEmail: string) => {
    const next = window.prompt(`كلمة مرور جديدة لـ ${staffEmail} (8 أحرف على الأقل)`);
    if (!next) return;
    if (next.length < 8) {
      toast.error("كلمة المرور قصيرة جداً");
      return;
    }
    try {
      await call({ action: "reset_password", userId, password: next });
      toast.success("تم تغيير كلمة المرور");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="p-5" dir="rtl">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold">صلاحيات الفريق</h2>
          <p className="text-xs text-muted-foreground">
            المشرف المساعد يرى فقط الروابط السريعة بعد تسجيل الدخول
          </p>
        </div>
      </div>

      <form onSubmit={createModerator} className="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label htmlFor="mod-email" className="text-xs">البريد الإلكتروني</Label>
          <Input
            id="mod-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
            required
          />
        </div>
        <div>
          <Label htmlFor="mod-pass" className="text-xs">كلمة المرور</Label>
          <Input
            id="mod-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8 أحرف على الأقل"
            minLength={8}
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            <UserPlus className="ms-2 h-4 w-4" />
            إضافة مشرف مساعد
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد صلاحيات بعد</p>
        ) : (
          users.map((u) => (
            <div
              key={u.user_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck
                  className={`h-4 w-4 ${u.role === "admin" ? "text-primary" : "text-muted-foreground"}`}
                />
                <span className="truncate text-sm">{u.email}</span>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                  {u.role === "admin" ? "مدير كامل" : "مشرف مساعد"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRole(u.user_id, u.role === "admin" ? "moderator" : "admin")}
                >
                  {u.role === "admin" ? "تحويل إلى مساعد" : "ترقية إلى مدير"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resetPassword(u.user_id, u.email)}
                >
                  <KeyRound className="ms-2 h-4 w-4" />
                  كلمة المرور
                </Button>
                <Button size="sm" variant="ghost" onClick={() => revoke(u.user_id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

export default StaffRolesCard;
