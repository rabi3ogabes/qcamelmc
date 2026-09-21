import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getStaffPasscode } from "@/lib/staffAccess";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  UserCheck,
  UserX,
  Users,
  CheckCheck,
} from "lucide-react";

type Status = "present" | "absent";

interface POSUser {
  id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
}

interface AttendanceRow {
  pos_user_id: string;
  attendance_date: string;
  status: Status;
}

const QATAR_TZ = "Asia/Qatar";

/** YYYY-MM-DD for a given date in Qatar time. */
const qatarDateKey = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
};

const shiftKey = (key: string, days: number) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const prettyDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-u-nu-latn", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const shortDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-u-nu-latn", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
  });
};

export const AttendanceTab = () => {
  const { toast } = useToast();
  const todayKey = useMemo(() => qatarDateKey(new Date()), []);
  const [dateKey, setDateKey] = useState(todayKey);
  const [users, setUsers] = useState<POSUser[]>([]);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  /** Editing requires a real account session; passcode-only staff get a read-only board. */
  const [canEdit, setCanEdit] = useState(false);

  const weekKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftKey(dateKey, i - 6)),
    [dateKey]
  );

  /**
   * All reads/writes go through the edge function. It uses the signed-in
   * dashboard session (same Supabase session as the admin dashboard) to decide
   * who may edit, and falls back to the shared passcode for read-only access.
   */
  const callAttendance = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("staff-attendance", {
      body: { ...payload, passcode: getStaffPasscode() },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.message || data.error);
    return data;
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const data = await callAttendance({
        mode: "list",
        from: weekKeys[0],
        to: dateKey,
      });
      setUsers((data?.users as POSUser[]) || []);
      setRecords((data?.records as AttendanceRow[]) || []);
      setCanEdit(!!data?.can_edit);
    } catch (error) {
      console.error("Attendance load error:", error);
      toast({
        title: "خطأ",
        description: "تعذّر تحميل بيانات الحضور",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [callAttendance, dateKey, weekKeys, toast]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  // Realtime is blocked for passcode-only staff, so refresh periodically instead.
  useEffect(() => {
    const id = window.setInterval(() => fetchAll(), 30000);
    return () => window.clearInterval(id);
  }, [fetchAll]);

  const statusFor = (userId: string, key = dateKey): Status | null =>
    records.find((r) => r.pos_user_id === userId && r.attendance_date === key)?.status ?? null;

  const currentUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  };

  const setStatus = async (userId: string, next: Status) => {
    const current = statusFor(userId);
    setSavingId(userId);
    try {
      const clearing = current === next;
      await callAttendance({
        mode: "set",
        date: dateKey,
        pos_user_id: userId,
        status: clearing ? null : next,
        marked_by: await currentUserId(),
      });
      setRecords((prev) => {
        const rest = prev.filter(
          (r) => !(r.pos_user_id === userId && r.attendance_date === dateKey)
        );
        return clearing
          ? rest
          : [...rest, { pos_user_id: userId, attendance_date: dateKey, status: next }];
      });
    } catch (error) {
      console.error("Attendance save error:", error);
      toast({ title: "خطأ", description: "لم يتم حفظ الحالة", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const markAllPresent = async () => {
    if (!users.length) return;
    setBulkBusy(true);
    try {
      await callAttendance({
        mode: "bulk_present",
        date: dateKey,
        marked_by: await currentUserId(),
      });
      setRecords((prev) => [
        ...prev.filter((r) => r.attendance_date !== dateKey),
        ...users.map((u) => ({
          pos_user_id: u.id,
          attendance_date: dateKey,
          status: "present" as Status,
        })),
      ]);
      toast({ title: "تم", description: "تم تسجيل الجميع كحاضرين" });
    } catch (error) {
      console.error(error);
      toast({ title: "خطأ", description: "تعذّر التحديث", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const clearDay = async () => {
    setBulkBusy(true);
    try {
      await callAttendance({ mode: "clear_day", date: dateKey });
      setRecords((prev) => prev.filter((r) => r.attendance_date !== dateKey));
      toast({ title: "تم", description: "تم مسح سجل هذا اليوم" });
    } catch (error) {
      console.error(error);
      toast({ title: "خطأ", description: "تعذّر المسح", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const present = users.filter((u) => statusFor(u.id) === "present").length;
  const absent = users.filter((u) => statusFor(u.id) === "absent").length;
  const pending = users.length - present - absent;

  const stats = [
    { label: "إجمالي الفريق", value: users.length, icon: Users, tone: "text-foreground" },
    { label: "حاضر", value: present, icon: UserCheck, tone: "text-emerald-600" },
    { label: "غائب", value: absent, icon: UserX, tone: "text-destructive" },
    { label: "بدون تسجيل", value: pending, icon: CalendarDays, tone: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              حضور الفريق
            </p>
            <h2 className="mt-1 text-2xl font-bold">سجل الحضور والغياب</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الأسماء مأخوذة من مستخدمي نقاط البيع النشطين
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border bg-background/70 p-1.5 backdrop-blur">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDateKey((k) => shiftKey(k, -1))}
              aria-label="اليوم السابق"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="min-w-[190px] text-center">
              <p className="text-sm font-semibold">{prettyDate(dateKey)}</p>
              <input
                type="date"
                value={dateKey}
                max={todayKey}
                onChange={(e) => e.target.value && setDateKey(e.target.value)}
                className="mt-1 w-full cursor-pointer bg-transparent text-center text-[11px] text-muted-foreground outline-none"
                dir="ltr"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={dateKey >= todayKey}
              onClick={() => setDateKey((k) => shiftKey(k, 1))}
              aria-label="اليوم التالي"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="border-border/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <Icon className={cn("h-5 w-5", tone)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-xl font-bold", tone)}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={markAllPresent} disabled={bulkBusy || !users.length} size="sm">
          <CheckCheck className="ms-2 h-4 w-4" />
          تحديد الكل حاضر
        </Button>
        <Button onClick={clearDay} disabled={bulkBusy} size="sm" variant="outline">
          <RotateCcw className="ms-2 h-4 w-4" />
          مسح اليوم
        </Button>
      </div>

      {/* People */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            لا يوجد مستخدمو نقاط بيع نشطون — أضفهم من صفحة «مستخدمي POS».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {users.map((user) => {
            const status = statusFor(user.id);
            return (
              <Card
                key={user.id}
                className={cn(
                  "overflow-hidden border-border/70 transition-all duration-300",
                  status === "present" && "border-emerald-500/50 bg-emerald-500/5",
                  status === "absent" && "border-destructive/50 bg-destructive/5"
                )}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                    {user.icon || "👤"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {status === "present"
                        ? "حاضر"
                        : status === "absent"
                        ? "غائب"
                        : "لم يُسجَّل بعد"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setStatus(user.id, "present")}
                      disabled={savingId === user.id}
                      aria-label={`تسجيل ${user.name} حاضر`}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
                        status === "present"
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-[var(--shadow-elegant)]"
                          : "border-border text-muted-foreground hover:border-emerald-500/60 hover:text-emerald-600"
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setStatus(user.id, "absent")}
                      disabled={savingId === user.id}
                      aria-label={`تسجيل ${user.name} غائب`}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
                        status === "absent"
                          ? "border-destructive bg-destructive text-destructive-foreground shadow-[var(--shadow-elegant)]"
                          : "border-border text-muted-foreground hover:border-destructive/60 hover:text-destructive"
                      )}
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Weekly summary */}
      {!loading && users.length > 0 && (
        <Card className="border-border/70">
          <CardContent className="overflow-x-auto p-4">
            <p className="mb-3 text-sm font-semibold">ملخّص آخر 7 أيام</p>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="p-2 text-right font-medium">الاسم</th>
                  {weekKeys.map((k) => (
                    <th key={k} className="p-2 text-center text-xs font-medium">
                      {shortDay(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-2 font-medium">
                      <span className="me-2">{u.icon || "👤"}</span>
                      {u.name}
                    </td>
                    {weekKeys.map((k) => {
                      const s = statusFor(u.id, k);
                      return (
                        <td key={k} className="p-2 text-center">
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                              s === "present" && "bg-emerald-500/15 text-emerald-600",
                              s === "absent" && "bg-destructive/15 text-destructive",
                              !s && "bg-muted text-muted-foreground/60"
                            )}
                          >
                            {s === "present" ? "✓" : s === "absent" ? "✗" : "–"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AttendanceTab;
