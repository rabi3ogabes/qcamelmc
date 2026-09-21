import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Eye, RefreshCw, ScanLine, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const QATAR_TZ = "Asia/Qatar";

/** YYYY-MM-DD in Qatar time. */
const qatarKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const shortLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-u-nu-latn", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
};

const RANGES = [
  { days: 1, label: "اليوم" },
  { days: 7, label: "آخر 7 أيام" },
  { days: 30, label: "آخر 30 يوم" },
];

interface DayRow {
  key: string;
  label: string;
  visitors: number;
  scans: number;
}

/** Compares how many people browsed the site against how many actually walked through the gate. */
export const VisitorsVsScansTab = () => {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dayKeys = useMemo(() => {
    const out: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      out.push(qatarKey(new Date(Date.now() - i * 86_400_000)));
    }
    return out;
  }, [days]);

  const load = useCallback(
    async (silent = false) => {
      silent ? setRefreshing(true) : setLoading(true);
      try {
        const start = new Date(Date.now() - (days - 1) * 86_400_000);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date();

        const [visitorsRes, scansRes] = await Promise.all([
          supabase.rpc("get_visitors_per_date", {
            start_date: start.toISOString(),
            end_date: end.toISOString(),
          }),
          supabase
            .from("ticket_holders")
            .select("confirmed_at")
            .eq("is_present", true)
            .gte("confirmed_at", start.toISOString())
            .lt("confirmed_at", end.toISOString())
            .limit(5000),
        ]);

        const visitorsByDay = new Map<string, number>();
        for (const v of (visitorsRes.data || []) as Array<{
          visit_date: string;
          unique_visitors: number;
        }>) {
          visitorsByDay.set(String(v.visit_date).slice(0, 10), Number(v.unique_visitors) || 0);
        }

        const scansByDay = new Map<string, number>();
        for (const s of (scansRes.data || []) as Array<{ confirmed_at: string | null }>) {
          if (!s.confirmed_at) continue;
          const key = qatarKey(new Date(s.confirmed_at));
          scansByDay.set(key, (scansByDay.get(key) || 0) + 1);
        }

        setRows(
          dayKeys.map((key) => ({
            key,
            label: shortLabel(key),
            visitors: visitorsByDay.get(key) || 0,
            scans: scansByDay.get(key) || 0,
          }))
        );
      } catch (e) {
        console.error("visitors vs scans load failed:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days, dayKeys]
  );

  useEffect(() => {
    load();
  }, [load]);

  const totalVisitors = rows.reduce((s, r) => s + r.visitors, 0);
  const totalScans = rows.reduce((s, r) => s + r.scans, 0);
  const rate = totalVisitors ? Math.round((totalScans / totalVisitors) * 100) : 0;

  const stats = [
    { label: "زوار الموقع", value: totalVisitors, icon: Eye, tone: "text-foreground" },
    { label: "تذاكر تم مسحها", value: totalScans, icon: ScanLine, tone: "text-emerald-600" },
    { label: "نسبة الوصول للبوابة", value: `${rate}%`, icon: TrendingUp, tone: "text-primary" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              الزوار مقابل الحضور
            </p>
            <h2 className="mt-1 text-2xl font-bold">من زار الموقع ومن حضر فعلاً</h2>
          </div>
          <div className="flex items-center gap-2">
            {RANGES.map((r) => (
              <Button
                key={r.days}
                size="sm"
                variant={days === r.days ? "default" : "outline"}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </Button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={cn("ms-2 h-4 w-4", refreshing && "animate-spin")} />
              تحديث
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="border-border/70">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                <Icon className={cn("h-5 w-5", tone)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-2xl font-bold", tone)}>{loading ? "—" : value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70">
        <CardContent className="p-5">
          <p className="mb-4 text-sm font-semibold">المقارنة اليومية</p>
          <div className="h-[320px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="visitors"
                  name="زوار الموقع"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="scans"
                  name="تذاكر ممسوحة"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VisitorsVsScansTab;
