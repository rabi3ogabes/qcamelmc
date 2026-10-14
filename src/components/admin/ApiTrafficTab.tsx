import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Activity, Gauge, Globe, Loader2, RefreshCw, Search, ShieldAlert, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QATAR_TZ } from "@/lib/qatarTime";

interface Call {
  id: number; fn: string; method: string; status: number; duration_ms: number;
  origin: string | null; ip: string | null; country: string | null; caller: string | null; created_at: string;
}

const RANGES = { "1h": 1 / 24, "24h": 1, "7d": 7 } as const;
type RangeKey = keyof typeof RANGES;
const RANGE_LABEL: Record<RangeKey, string> = { "1h": "آخر ساعة", "24h": "آخر 24 ساعة", "7d": "آخر 7 أيام" };
const MAX_ROWS = 20000;

const CALLER_LABEL: Record<string, string> = {
  signed_in: "مستخدم مسجّل", anonymous: "زائر / عام", server: "خادم داخلي",
  staff_passcode: "فريق بكلمة المرور", external: "خدمة خارجية",
};

const FN_LABEL: Record<string, string> = {
  "create-order": "إنشاء طلب", "sadad-payment": "بدء دفع سداد", "sadad-webhook": "إشعار سداد",
  "sadad-callback": "عودة من سداد", "verify-payment": "التحقق من الدفع", "ticket-checkin": "مسح التذاكر",
  "send-invoice-email": "فاتورة بالبريد", "send-to-webhook": "إرسال n8n", "n8n-response": "رد n8n",
  "login-guard": "حماية الدخول", "staff-auth": "دخول الفريق", "gate-stats": "لوحة البوابة",
  "auth-email-hook": "رسائل الحسابات", "staff-attendance": "حضور الفريق",
};

const hostOf = (o: string | null) => {
  if (!o) return "مباشر / خادم";
  try { return new URL(o).host; } catch { return o; }
};
const fmt = (iso: string) => new Date(iso).toLocaleString("ar-u-nu-latn", {
  timeZone: QATAR_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function topBy<T>(rows: T[], key: (r: T) => string, n = 6) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export const ApiTrafficTab = () => {
  const [range, setRange] = useState<RangeKey>("24h");
  const [rows, setRows] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGES[range] * 864e5).toISOString();
    const all: Call[] = [];
    for (let from = 0; from < MAX_ROWS; from += 1000) {
      const { data, error } = await supabase.from("api_calls")
        .select("id, fn, method, status, duration_ms, origin, ip, country, caller, created_at")
        .gte("created_at", since).order("created_at", { ascending: false }).range(from, from + 999);
      if (error || !data) break;
      all.push(...(data as Call[]));
      if (data.length < 1000) break;
    }
    setRows(all);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const byFn = useMemo(() => {
    const m = new Map<string, { calls: number; errors: number; ms: number; last: string; callers: Set<string> }>();
    rows.forEach((r) => {
      const s = m.get(r.fn) ?? { calls: 0, errors: 0, ms: 0, last: r.created_at, callers: new Set() };
      s.calls++; s.ms += r.duration_ms; if (r.status >= 400) s.errors++;
      if (r.created_at > s.last) s.last = r.created_at;
      s.callers.add(hostOf(r.origin));
      m.set(r.fn, s);
    });
    return [...m.entries()].sort((a, b) => b[1].calls - a[1].calls);
  }, [rows]);

  const scoped = useMemo(() => (selected ? rows.filter((r) => r.fn === selected) : rows), [rows, selected]);
  const errors = scoped.filter((r) => r.status >= 400).length;
  const avgMs = scoped.length ? Math.round(scoped.reduce((s, r) => s + r.duration_ms, 0) / scoped.length) : 0;
  const perMin = scoped.length / Math.max(1, RANGES[range] * 1440);

  const buckets = useMemo(() => {
    const n = 24, span = RANGES[range] * 864e5, now = Date.now();
    const b = Array.from({ length: n }, () => ({ ok: 0, err: 0 }));
    scoped.forEach((r) => {
      const t = Date.parse(String(r.created_at).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
      if (Number.isNaN(t)) return;
      const i = Math.floor((now - t) / (span / n));
      if (i >= 0 && i < n) r.status >= 400 ? b[n - 1 - i].err++ : b[n - 1 - i].ok++;
    });
    return b;
  }, [scoped, range]);
  const peak = Math.max(1, ...buckets.map((b) => b.ok + b.err));

  const recent = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scoped.filter((r) => !s || [r.fn, r.ip, r.origin, String(r.status)].some((v) => v?.toLowerCase().includes(s))).slice(0, 100);
  }, [scoped, q]);

  // Unusual traffic: one IP producing a large share of calls.
  const hotIps = topBy(scoped.filter((r) => r.ip), (r) => r.ip!, 5).filter(([, c]) => c >= 50 && c / Math.max(1, scoped.length) > 0.2);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> حركة الـ API</h1>
          <p className="text-sm text-muted-foreground mt-1">كل استدعاء لخدمات النظام: كم مرة، من أين، وبأي نتيجة. يتحدّث كل 30 ثانية.</p>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Button key={k} size="sm" variant={range === k ? "default" : "outline"} onClick={() => setRange(k)}>{RANGE_LABEL[k]}</Button>
          ))}
          <Button size="icon" variant="outline" onClick={load} aria-label="تحديث">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {hotIps.length > 0 && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">حركة غير معتادة</p>
            {hotIps.map(([ip, c]) => <p key={ip} dir="ltr" className="text-right">{ip} — {c} استدعاء ({pct(c, scoped.length)}%)</p>)}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Zap, label: "إجمالي الاستدعاءات", value: scoped.length.toLocaleString("en") },
          { icon: Gauge, label: "متوسط الاستجابة", value: `${avgMs} ms` },
          { icon: ShieldAlert, label: "نسبة الأخطاء", value: `${pct(errors, scoped.length)}%`, warn: pct(errors, scoped.length) > 10 },
          { icon: Activity, label: "بالدقيقة", value: perMin.toFixed(1) },
        ].map((s) => (
          <Card key={s.label} className="p-4 border-primary/20 bg-gradient-to-br from-card to-primary/5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><s.icon className="w-4 h-4 text-primary" />{s.label}</div>
            <div className={`text-2xl font-bold mt-2 ${s.warn ? "text-destructive" : ""}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>{selected ? `${FN_LABEL[selected] ?? selected}` : "كل الخدمات"} — الحركة عبر الزمن</span>
          <span className="flex gap-3"><span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-primary inline-block" />ناجح</span><span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-destructive inline-block" />خطأ</span></span>
        </div>
        <div className="flex items-end gap-1" style={{ height: 112 }} dir="ltr" data-chart="api-timeline">
          {buckets.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end rounded-t-sm overflow-hidden bg-muted/40" style={{ height: Math.max(2, ((b.ok + b.err) / peak) * 112) }} title={`${b.ok + b.err} استدعاء`}>
              <div className="bg-destructive/80" style={{ flexGrow: b.err }} />
              <div className="bg-primary/80" style={{ flexGrow: b.ok }} />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">الخدمات</h2>
            {selected && <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>عرض الكل</Button>}
          </div>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs"><tr className="text-right">
              <th className="py-2">الخدمة</th><th>الاستدعاءات</th><th>الأخطاء</th><th>المتوسط</th><th>المصادر</th><th>آخر استدعاء</th>
            </tr></thead>
            <tbody>
              {byFn.map(([fn, s]) => (
                <tr key={fn} onClick={() => setSelected(fn === selected ? null : fn)}
                  className={`border-t border-border cursor-pointer hover:bg-muted/40 ${selected === fn ? "bg-primary/10" : ""}`}>
                  <td className="py-2"><div className="font-medium">{FN_LABEL[fn] ?? fn}</div><div className="text-[11px] text-muted-foreground" dir="ltr">{fn}</div></td>
                  <td>
                    <div className="font-semibold">{s.calls}</div>
                    <div className="h-1 bg-muted rounded mt-1 w-20"><div className="h-1 bg-primary rounded" style={{ width: `${pct(s.calls, byFn[0][1].calls)}%` }} /></div>
                  </td>
                  <td>{s.errors ? <Badge variant="destructive">{s.errors} ({pct(s.errors, s.calls)}%)</Badge> : <span className="text-muted-foreground">0</span>}</td>
                  <td>{Math.round(s.ms / s.calls)} ms</td>
                  <td className="text-xs max-w-[160px] truncate" title={[...s.callers].join(", ")}>{[...s.callers].slice(0, 2).join("، ")}{s.callers.size > 2 ? ` +${s.callers.size - 2}` : ""}</td>
                  <td className="text-xs whitespace-nowrap">{fmt(s.last)}</td>
                </tr>
              ))}
              {!byFn.length && !loading && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد استدعاءات في هذه الفترة</td></tr>}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          {[
            { title: "من أين", icon: Globe, data: topBy(scoped, (r) => hostOf(r.origin)) },
            { title: "نوع المستدعي", icon: Activity, data: topBy(scoped, (r) => CALLER_LABEL[r.caller ?? ""] ?? "غير معروف") },
            { title: "أكثر العناوين (IP)", icon: ShieldAlert, data: topBy(scoped.filter((r) => r.ip), (r) => `${r.ip}${r.country ? ` · ${r.country}` : ""}`) },
          ].map((b) => (
            <Card key={b.title} className="p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><b.icon className="w-4 h-4 text-primary" />{b.title}</h3>
              <div className="space-y-2">
                {b.data.map(([k, c]) => (
                  <div key={k} className="text-xs">
                    <div className="flex justify-between gap-2"><span className="truncate" dir="auto">{k}</span><span className="font-semibold">{c}</span></div>
                    <div className="h-1 bg-muted rounded mt-1"><div className="h-1 bg-primary/70 rounded" style={{ width: `${pct(c, scoped.length)}%` }} /></div>
                  </div>
                ))}
                {!b.data.length && <p className="text-xs text-muted-foreground">—</p>}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-4 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">آخر الاستدعاءات</h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute right-3 top-2.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالخدمة أو IP أو الحالة" className="pr-9 h-9" />
          </div>
        </div>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground"><tr className="text-right">
            <th className="py-2">الوقت</th><th>الخدمة</th><th>الحالة</th><th>المدة</th><th>المستدعي</th><th>المصدر</th><th>IP</th>
          </tr></thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1.5 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td dir="ltr" className="text-right">{r.method} {r.fn}</td>
                <td><Badge variant={r.status >= 400 ? "destructive" : "secondary"}>{r.status}</Badge></td>
                <td>{r.duration_ms} ms</td>
                <td>{CALLER_LABEL[r.caller ?? ""] ?? "—"}</td>
                <td className="max-w-[160px] truncate">{hostOf(r.origin)}</td>
                <td dir="ltr" className="text-right">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length >= MAX_ROWS && <p className="text-[11px] text-muted-foreground mt-2">يُعرض أحدث {MAX_ROWS.toLocaleString("en")} استدعاء فقط.</p>}
      </Card>
    </div>
  );
};
