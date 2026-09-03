import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  BellRing,
  CheckCheck,
  CreditCard,
  Globe,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Store,
  Ticket,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEEN_KEY = "admin:notifications:lastSeenAt";
const PAGE_SIZE = 40;

type NotificationRow = {
  id: string;
  created_at: string;
  booking_reference: string;
  payment_method: "sadad" | "cash_pos";
  payment_status: "pending" | "confirmed" | "cancelled" | null;
  total_amount: number;
  quantity: number;
  ticket_type: string;
  customers: { name: string | null; phone: string | null } | null;
  events: { title: string | null } | null;
};

type SourceFilter = "all" | "sadad" | "cash_pos";
type ViewMode = "list" | "grid";

const qatarTime = (iso: string) =>
  new Date(iso).toLocaleString("ar-u-nu-latn", {
    timeZone: "Asia/Qatar",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const statusMeta: Record<string, { label: string; className: string }> = {
  confirmed: { label: "مدفوع / مؤكد", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  pending: { label: "قيد الانتظار", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  cancelled: { label: "ملغي", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

const NotificationsTab = () => {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceFilter>("all");
  const [lastSeen, setLastSeen] = useState<string>(
    () => localStorage.getItem(SEEN_KEY) || new Date(0).toISOString()
  );
  const seenRef = useRef(lastSeen);
  seenRef.current = lastSeen;

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, booking_reference, payment_method, payment_status, total_amount, quantity, ticket_type, customers(name, phone), events(title)"
      )
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error("notifications fetch error", error);
      toast.error("تعذر تحميل الإشعارات");
      return;
    }
    setRows((data || []) as unknown as NotificationRow[]);
  }, []);

  useEffect(() => {
    fetchRows().finally(() => setLoading(false));

    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchRows()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRows]);

  const filtered = useMemo(
    () => (source === "all" ? rows : rows.filter((r) => r.payment_method === source)),
    [rows, source]
  );

  const unreadCount = useMemo(
    () => rows.filter((r) => r.created_at > lastSeen).length,
    [rows, lastSeen]
  );

  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setLastSeen(now);
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-gradient-to-l from-primary/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <BellRing className="h-5 w-5 text-primary" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">الإشعارات</h2>
            <p className="text-sm text-muted-foreground">
              كل الحجوزات الواردة من الدفع الإلكتروني ونقاط البيع لحظياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchRows()}>
            <RefreshCw className="ms-2 h-4 w-4" />
            تحديث
          </Button>
          <Button size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="ms-2 h-4 w-4" />
            تعليم الكل كمقروء
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Tabs value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="all" className="gap-2">
            <Bell className="h-4 w-4" /> الكل
          </TabsTrigger>
          <TabsTrigger value="sadad" className="gap-2">
            <Globe className="h-4 w-4" /> دفع إلكتروني
          </TabsTrigger>
          <TabsTrigger value="cash_pos" className="gap-2">
            <Store className="h-4 w-4" /> نقاط البيع
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">لا توجد إشعارات حتى الآن</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const isNew = row.created_at > lastSeen;
            const isPos = row.payment_method === "cash_pos";
            const status = statusMeta[row.payment_status || "pending"];
            return (
              <Card
                key={row.id}
                className={cn(
                  "relative overflow-hidden border-border/60 p-4 transition-colors",
                  isNew && "bg-primary/[0.04] ring-1 ring-primary/20"
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 right-0 w-1",
                    isPos ? "bg-amber-500" : "bg-primary"
                  )}
                />
                <div className="flex flex-col gap-3 pr-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        isPos ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                      )}
                    >
                      {isPos ? <Store className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {isPos ? "حجز نقاط بيع" : "دفع إلكتروني (سداد)"}
                        </span>
                        {isNew && (
                          <Badge className="bg-destructive text-destructive-foreground">جديد</Badge>
                        )}
                        {status && (
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {row.customers?.name || "عميل غير معروف"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Ticket className="h-3.5 w-3.5" />
                          {row.quantity} تذكرة
                        </span>
                        <span dir="ltr" className="font-mono text-xs">
                          {row.booking_reference}
                        </span>
                      </div>
                      {row.events?.title && (
                        <p className="text-xs text-muted-foreground/80">{row.events.title}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                    <span className="text-lg font-bold text-primary">
                      {Number(row.total_amount || 0).toLocaleString("ar-u-nu-latn")} ر.ق
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {qatarTime(row.created_at)}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotificationsTab;
