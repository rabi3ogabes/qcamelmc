import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bell,
  BellRing,
  CalendarDays,
  CheckCheck,
  Clock,
  CreditCard,
  Hash,
  Phone,
  RefreshCw,
  Store,
  Ticket,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEEN_KEY = "admin:notifications:lastSeenAt";
const PAGE_SIZE = 200;

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
  events: { title: string | null; event_date: string | null } | null;
};

type DateFilter = "today" | "yesterday" | "custom" | "all";

const SELECT_COLS =
  "id, created_at, booking_reference, payment_method, payment_status, total_amount, quantity, ticket_type, customers(name, phone), events(title, event_date)";

/** YYYY-MM-DD in Qatar time */
const qatarDateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** Qatar (UTC+3) day boundaries as UTC ISO strings */
const qatarDayRange = (dayKey: string) => {
  const start = new Date(`${dayKey}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

const shiftDay = (dayKey: string, days: number) =>
  qatarDateKey(new Date(new Date(`${dayKey}T12:00:00+03:00`).getTime() + days * 86400000));

const qatarTime = (iso: string) =>
  new Date(iso).toLocaleString("ar-u-nu-latn", {
    timeZone: "Asia/Qatar",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const qatarFull = (iso: string) =>
  new Date(iso).toLocaleString("ar-u-nu-latn", {
    timeZone: "Asia/Qatar",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const statusMeta: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "مدفوع / مؤكد",
    className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  },
  pending: {
    label: "قيد الانتظار",
    className: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  },
  cancelled: {
    label: "ملغي",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

const money = (v: number) => `${Number(v || 0).toLocaleString("ar-u-nu-latn")} ر.ق`;

const NotificationCard = ({
  row,
  isNew,
  justArrived,
  onClick,
}: {
  row: NotificationRow;
  isNew: boolean;
  justArrived: boolean;
  onClick: () => void;
}) => {
  const isPos = row.payment_method === "cash_pos";
  const status = statusMeta[row.payment_status || "pending"];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-border/60 bg-card p-3 text-right shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elegant",
        isNew && "bg-primary/[0.04] ring-1 ring-primary/20",
        justArrived && "animate-in fade-in slide-in-from-top-4 duration-700"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 right-0 w-1",
          isPos ? "bg-amber-500" : "bg-primary"
        )}
      />
      <div className="flex flex-col gap-2 pr-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              isPos ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
            )}
          >
            {isPos ? <Store className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
          </div>
          {isNew && (
            <Badge className="h-5 animate-pulse bg-destructive px-1.5 text-[10px] text-destructive-foreground">
              جديد
            </Badge>
          )}
        </div>

        <p className="truncate text-sm font-semibold">
          {row.customers?.name || "عميل غير معروف"}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {status && (
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", status.className)}>
              {status.label}
            </Badge>
          )}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Ticket className="h-3 w-3" />
            {row.quantity}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-2">
          <span className="text-sm font-bold text-primary">{money(row.total_amount)}</span>
          <span className="text-[10px] text-muted-foreground">{qatarTime(row.created_at)}</span>
        </div>
      </div>
    </button>
  );
};

const NotificationsTab = () => {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customDay, setCustomDay] = useState<string>(() => qatarDateKey(new Date()));
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const [arrivedIds, setArrivedIds] = useState<string[]>([]);
  const [lastSeen, setLastSeen] = useState<string>(
    () => localStorage.getItem(SEEN_KEY) || new Date(0).toISOString()
  );

  const activeDay = useMemo(() => {
    if (dateFilter === "today") return qatarDateKey(new Date());
    if (dateFilter === "yesterday") return shiftDay(qatarDateKey(new Date()), -1);
    if (dateFilter === "custom") return customDay;
    return null;
  }, [dateFilter, customDay]);

  const activeDayRef = useRef<string | null>(activeDay);
  activeDayRef.current = activeDay;

  const fetchRows = useCallback(async () => {
    let query = supabase.from("orders").select(SELECT_COLS);
    if (activeDay) {
      const { start, end } = qatarDayRange(activeDay);
      query = query.gte("created_at", start).lt("created_at", end);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error("notifications fetch error", error);
      toast.error("تعذر تحميل الإشعارات");
      return;
    }
    setRows((data || []) as unknown as NotificationRow[]);
  }, [activeDay]);

  useEffect(() => {
    setLoading(true);
    fetchRows().finally(() => setLoading(false));
  }, [fetchRows]);

  // Realtime: prepend new orders, patch updates — no page reload
  useEffect(() => {
    const channel = supabase
      .channel("admin-notifications-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;
          const { data } = await supabase
            .from("orders")
            .select(SELECT_COLS)
            .eq("id", id)
            .maybeSingle();
          if (!data) return;
          const row = data as unknown as NotificationRow;
          const day = activeDayRef.current;
          if (day) {
            const { start, end } = qatarDayRange(day);
            if (row.created_at < start || row.created_at >= end) return;
          }
          setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
          setArrivedIds((prev) => [...prev, row.id]);
          setTimeout(
            () => setArrivedIds((prev) => prev.filter((x) => x !== row.id)),
            1200
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;
          const { data } = await supabase
            .from("orders")
            .select(SELECT_COLS)
            .eq("id", id)
            .maybeSingle();
          if (!data) return;
          const row = data as unknown as NotificationRow;
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          setSelected((cur) => (cur && cur.id === row.id ? row : cur));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const posRows = useMemo(
    () => rows.filter((r) => r.payment_method === "cash_pos"),
    [rows]
  );
  const onlineRows = useMemo(
    () => rows.filter((r) => r.payment_method !== "cash_pos"),
    [rows]
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

  const dateButtons: { key: DateFilter; label: string }[] = [
    { key: "today", label: "اليوم" },
    { key: "yesterday", label: "أمس" },
    { key: "custom", label: "يوم محدد" },
    { key: "all", label: "الكل" },
  ];

  const renderColumn = (
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    accent: string,
    list: NotificationRow[],
    total: number
  ) => (
    <Card className="flex flex-col overflow-hidden border-border/60">
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border/60 p-4",
          accent
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/70 ring-1 ring-border/60">
            {icon}
          </div>
          <div>
            <h3 className="font-lusail text-base font-bold">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="text-left">
          <p className="text-lg font-bold">{list.length.toLocaleString("ar-u-nu-latn")}</p>
          <p className="text-[11px] text-muted-foreground">{money(total)}</p>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-3">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Bell className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">لا توجد إشعارات</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((row) => (
              <NotificationCard
                key={row.id}
                row={row}
                isNew={row.created_at > lastSeen}
                justArrived={arrivedIds.includes(row.id)}
                onClick={() => setSelected(row)}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );

  const sum = (list: NotificationRow[]) =>
    list.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);

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
            <h2 className="font-lusail text-xl font-bold tracking-tight">الإشعارات</h2>
            <p className="text-sm text-muted-foreground">
              الحجوزات الواردة لحظياً — نقاط البيع والدفع الإلكتروني
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          التاريخ
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-background p-1">
          {dateButtons.map((b) => (
            <Button
              key={b.key}
              size="sm"
              variant={dateFilter === b.key ? "default" : "ghost"}
              className="font-lusail h-8"
              onClick={() => setDateFilter(b.key)}
            >
              {b.label}
            </Button>
          ))}
        </div>
        {dateFilter === "custom" && (
          <Input
            type="date"
            dir="ltr"
            value={customDay}
            onChange={(e) => setCustomDay(e.target.value)}
            className="h-9 w-[170px]"
          />
        )}
        {activeDay && (
          <Badge variant="outline" className="h-7 gap-1">
            <Clock className="h-3 w-3" />
            {new Date(`${activeDay}T12:00:00+03:00`).toLocaleDateString("ar-u-nu-latn", {
              timeZone: "Asia/Qatar",
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Badge>
        )}
      </div>

      {/* Two columns */}
      <div className="grid gap-5 xl:grid-cols-2">
        {renderColumn(
          "نقاط البيع",
          "المبيعات النقدية من نقاط البيع",
          <Store className="h-5 w-5 text-amber-500" />,
          "bg-amber-500/5",
          posRows,
          sum(posRows)
        )}
        {renderColumn(
          "دفع إلكتروني",
          "الحجوزات عبر بوابة سداد",
          <CreditCard className="h-5 w-5 text-primary" />,
          "bg-primary/5",
          onlineRows,
          sum(onlineRows)
        )}
      </div>

      {/* Details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-lusail flex items-center gap-2">
              {selected?.payment_method === "cash_pos" ? (
                <Store className="h-5 w-5 text-amber-500" />
              ) : (
                <CreditCard className="h-5 w-5 text-primary" />
              )}
              {selected?.payment_method === "cash_pos"
                ? "حجز نقاط بيع"
                : "دفع إلكتروني (سداد)"}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {statusMeta[selected.payment_status || "pending"] && (
                  <Badge
                    variant="outline"
                    className={statusMeta[selected.payment_status || "pending"].className}
                  >
                    {statusMeta[selected.payment_status || "pending"].label}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1" dir="ltr">
                  <Hash className="h-3 w-3" />
                  {selected.booking_reference}
                </Badge>
              </div>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {selected.customers?.name || "عميل غير معروف"}
                </div>
                <div className="flex items-center gap-2 text-sm" dir="ltr">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {selected.customers?.phone || "—"}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  {selected.quantity} تذكرة — {selected.ticket_type}
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  {money(selected.total_amount)}
                </div>
                <div className="flex items-center gap-2 text-sm sm:col-span-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {selected.events?.title || "—"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                  <Clock className="h-4 w-4" />
                  {qatarFull(selected.created_at)}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(`/invoice/${selected.booking_reference}`, "_blank")
                  }
                >
                  عرض الفاتورة
                </Button>
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotificationsTab;
