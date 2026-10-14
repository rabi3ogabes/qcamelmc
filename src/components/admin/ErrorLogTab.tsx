import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertOctagon, CheckCircle2, ChevronDown, Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CAUSE_LABELS, CAUSE_ORDER, classifyError, type ErrorCause } from "@/lib/errorCauses";
import { QATAR_TZ } from "@/lib/qatarTime";

interface LogItem {
  key: string;
  origin: "site" | "payment" | "email";
  appErrorId?: string;
  title: string;
  detail: string | null;
  page: string | null;
  count: number;
  lastSeen: string;
  firstSeen: string;
  resolved: boolean;
  stack?: string | null;
  cause: ErrorCause;
}

const RANGES = { "1": 1, "7": 7, "30": 30 } as const;
type RangeKey = keyof typeof RANGES;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ar-u-nu-latn", {
    timeZone: QATAR_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

const originLabel = { site: "الموقع", payment: "الدفع", email: "البريد" } as const;

export const ErrorLogTab = () => {
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>("7");
  const [showResolved, setShowResolved] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    const since = new Date(Date.now() - RANGES[range] * 86400000).toISOString();
    try {
      const [app, pay, mail] = await Promise.all([
        supabase.from("app_errors").select("*").gte("last_seen_at", since).order("last_seen_at", { ascending: false }).limit(1000),
        supabase.from("payment_errors").select("id, created_at, error_source, error_code, error_message, booking_reference")
          .gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
        supabase.from("email_delivery_events").select("id, created_at, template, status, detail, recipient")
          .gte("created_at", since).not("status", "in", "(sent,queued,pending)").order("created_at", { ascending: false }).limit(1000),
      ]);
      if (app.error) throw app.error;
      if (pay.error) throw pay.error;
      if (mail.error) throw mail.error;

      const list: LogItem[] = (app.data ?? []).map((r) => ({
        key: `a-${r.id}`, origin: "site", appErrorId: r.id, title: r.message, detail: r.kind, page: r.page,
        count: r.occurrences, lastSeen: r.last_seen_at, firstSeen: r.first_seen_at, resolved: !!r.resolved_at,
        stack: r.stack, cause: classifyError({ source: r.source, kind: r.kind, message: r.message }),
      }));

      // Group repeated payment / email failures by their reason.
      const group = (origin: "payment" | "email", reason: string, detail: string | null, at: string) => {
        const key = `${origin}-${reason}`;
        const found = list.find((i) => i.key === key);
        if (found) {
          found.count += 1;
          if (at > found.lastSeen) found.lastSeen = at;
          if (at < found.firstSeen) found.firstSeen = at;
        } else {
          list.push({ key, origin, title: reason, detail, page: null, count: 1, lastSeen: at, firstSeen: at,
            resolved: false, cause: origin });
        }
      };
      (pay.data ?? []).forEach((r) =>
        group("payment", r.error_message || r.error_code || "فشل دفع بدون سبب", `المصدر: ${r.error_source}${r.error_code ? ` · الرمز ${r.error_code}` : ""}`, r.created_at));
      (mail.data ?? []).forEach((r) =>
        group("email", r.detail || `حالة الإرسال: ${r.status}`, `القالب: ${r.template}`, r.created_at));

      setItems(list);
    } catch (e) {
      toast.error("تعذّر تحميل سجل الأخطاء");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const setResolved = async (item: LogItem, resolved: boolean) => {
    if (!item.appErrorId) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_errors")
      .update({ resolved_at: resolved ? new Date().toISOString() : null, resolved_by: resolved ? u.user?.id ?? null : null })
      .eq("id", item.appErrorId);
    if (error) return toast.error("تعذّر تحديث الحالة");
    setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, resolved } : i)));
    toast.success(resolved ? "تم تعليمه كمحلول — سيعود للظهور إن تكرر" : "أعيد فتحه");
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (showResolved || !i.resolved) &&
      (!q || `${i.title} ${i.detail ?? ""} ${i.page ?? ""}`.toLowerCase().includes(q)));
  }, [items, showResolved, search]);

  const groups = useMemo(() =>
    CAUSE_ORDER.map((cause) => {
      const list = visible.filter((i) => i.cause === cause).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
      return { cause, list, total: list.reduce((s, i) => s + i.count, 0) };
    }).filter((g) => g.list.length > 0), [visible]);

  const totalCount = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-2xl border bg-gradient-to-l from-destructive/10 via-card to-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" /> لمدير النظام فقط
            </p>
            <h2 className="mt-1 text-2xl font-bold">سجل الأخطاء</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              كل ما تعثّر في النظام أو الموقع، مجمّعاً بحسب السبب.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing || loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-muted/40 p-1">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <Button key={k} size="sm" variant={range === k ? "default" : "ghost"} onClick={() => setRange(k)}>
                {k === "1" ? "آخر 24 ساعة" : `آخر ${k} يوم`}
              </Button>
            ))}
          </div>
          <Button size="sm" variant={showResolved ? "default" : "outline"} onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "إخفاء المحلولة" : "إظهار المحلولة"}
          </Button>
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في الأخطاء أو الصفحات" className="pr-9" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <p className="font-bold">لا توجد أخطاء في هذه الفترة</p>
          <p className="text-sm text-muted-foreground">كل شيء يعمل بسلاسة.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {groups.map((g) => (
              <Card key={g.cause} className="p-4">
                <p className="text-xs text-muted-foreground">{CAUSE_LABELS[g.cause].title}</p>
                <p className="mt-1 text-2xl font-bold">{g.total}</p>
                <p className="text-[11px] text-muted-foreground">{g.list.length} سبب مختلف</p>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">الإجمالي: {totalCount} حالة</p>

          <div className="space-y-3">
            {groups.map((g) => (
              <Collapsible key={g.cause} defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-right hover:bg-muted/50 [&[data-state=open]_svg.chev]:rotate-180">
                  <div className="flex items-center gap-3">
                    <AlertOctagon className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-bold">{CAUSE_LABELS[g.cause].title}</p>
                      <p className="text-xs text-muted-foreground">{CAUSE_LABELS[g.cause].hint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{g.total}</Badge>
                    <ChevronDown className="chev h-4 w-4 text-muted-foreground transition-transform" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {g.list.map((i) => (
                    <Card key={i.key} className={`p-4 ${i.resolved ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{originLabel[i.origin]}</Badge>
                            <Badge variant="secondary">×{i.count}</Badge>
                            {i.resolved && <Badge>محلول</Badge>}
                          </div>
                          <p className="break-words font-medium" dir="auto">{i.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.detail}{i.page ? ` · الصفحة ${i.page}` : ""} · أول مرة {fmt(i.firstSeen)} · آخر مرة {fmt(i.lastSeen)}
                          </p>
                          {i.stack && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground">التفاصيل التقنية</summary>
                              <pre dir="ltr" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-[10px]">{i.stack}</pre>
                            </details>
                          )}
                        </div>
                        {i.appErrorId && (
                          <Button size="sm" variant="outline" onClick={() => setResolved(i, !i.resolved)}>
                            {i.resolved ? "إعادة فتح" : "تم الحل"}
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
