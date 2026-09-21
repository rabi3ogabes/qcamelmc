import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getStaffPasscode } from "@/lib/staffAccess";
import { cn } from "@/lib/utils";
import { ArrowLeft, RefreshCw, ScanLine, Ticket, Users } from "lucide-react";

interface Recent {
  id: string;
  name: string;
  ticket_type: string;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
}

interface Board {
  event?: { title?: string; event_date?: string } | null;
  totals?: Record<string, { issued: number; scanned: number }>;
  issued?: number;
  scanned?: number;
  recent?: Recent[];
  generated_at?: string;
}

const TYPE_LABEL: Record<string, string> = {
  normal: "عادي",
  vip: "VIP",
  parking: "مواقف",
  عادي: "عادي",
  مواقف: "مواقف",
  VIP: "VIP",
};

const timeLabel = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("ar-u-nu-latn", {
        timeZone: "Asia/Qatar",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

/** Live gate board: how many ticket holders have walked in, refreshed on demand. */
const StaffGateBoard = () => {
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("gate-stats", {
        body: { passcode: getStaffPasscode() },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setBoard(data as Board);
      setError(null);
    } catch (e) {
      setError(
        (e as Error).message === "no_current_event"
          ? "لم يتم تحديد فعالية حالية بعد"
          : "تعذّر تحميل أرقام البوابة"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Silent auto-refresh so the numbers stay live without blanking the screen.
  useEffect(() => {
    const id = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const issued = board?.issued ?? 0;
  const scanned = board?.scanned ?? 0;
  const remaining = Math.max(0, issued - scanned);
  const percent = issued ? Math.round((scanned / issued) * 100) : 0;

  const cards = [
    { label: "التذاكر المُصدرة", value: issued, icon: Ticket, tone: "text-foreground" },
    { label: "دخلوا البوابة", value: scanned, icon: ScanLine, tone: "text-emerald-600" },
    { label: "لم يدخلوا بعد", value: remaining, icon: Users, tone: "text-muted-foreground" },
  ];

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              لوحة البوابة
            </p>
            <h1 className="truncate text-lg font-bold">
              {board?.event?.title || "الحضور المباشر"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={cn("ms-2 h-4 w-4", refreshing && "animate-spin")} />
              تحديث
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/staff")}>
              <ArrowLeft className="ms-2 h-4 w-4" />
              رجوع
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className="border-border/70">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Icon className={cn("h-6 w-6", tone)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-3xl font-bold", tone)}>
                    {loading ? "—" : value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Progress */}
        <Card className="border-border/70">
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">نسبة الحضور</span>
              <span className="text-muted-foreground">{percent}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {Object.entries(board?.totals || {}).map(([type, t]) => (
                <div key={type} className="rounded-xl border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">{TYPE_LABEL[type] || type}</p>
                  <p className="mt-1 text-lg font-bold">
                    {t.scanned} <span className="text-sm text-muted-foreground">/ {t.issued}</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent scans */}
        <Card className="border-border/70">
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-semibold">آخر عمليات المسح</p>
            {(board?.recent || []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد عمليات مسح بعد
              </p>
            ) : (
              <div className="divide-y">
                {board!.recent!.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABEL[r.ticket_type] || r.ticket_type}
                        {r.confirmed_by_name ? ` — ${r.confirmed_by_name}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeLabel(r.confirmed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {board?.generated_at && (
          <p className="text-center text-xs text-muted-foreground">
            آخر تحديث: {timeLabel(board.generated_at)}
          </p>
        )}
      </main>
    </div>
  );
};

export default StaffGateBoard;
