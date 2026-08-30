import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Banknote,
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExternalLink, Eye, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

const QATAR_TZ = "Asia/Qatar";
const PAGE_SIZE = 30;


interface TransactionRow {
  id: string;
  customer_id: string;
  booking_reference: string;
  payment_id: string | null;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  confirmed_at: string | null;
  payment_error_reason: string | null;
  customers: { name: string; phone: string; email: string } | null;
  events: { title: string; event_date: string } | null;
}

interface RelatedOrder {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  quantity: number;
  created_at: string;
}

/** Fields returned by Sadad's Get-Single-Transaction API (normalised by the edge function). */
interface SadadTx {
  transactionno: string;
  status: string;
  statusAr: string;
  isRefund: boolean;
  amount: number;
  commission: number;
  refundCharge: number;
  netAmount: number;
  mode: string | null;
  entity: string | null;
  transactiondate: string | null;
  websiteRefNo: string | null;
}

interface SadadInfoState {
  loading: boolean;
  error?: string;
  tx?: SadadTx;
}

const SADAD_STATUS_CLASS = (status: string) => {
  switch (status.toUpperCase()) {
    case "SUCCESS":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "FAILED":
    case "REJECTED":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "REFUND":
    case "REFUNDED":
      return "bg-sky-500/10 text-sky-600 border-sky-500/30";
    case "PENDING":
    case "INPROGRESS":
    case "IN PROGRESS":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const qar = (v: unknown) => {
  const n = Number(v);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} ر.ق`;
};


const STATUS_META: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  confirmed: {
    label: "ناجحة",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    icon: CheckCircle2,
  },
  pending: {
    label: "قيد الانتظار",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    icon: Clock,
  },
  cancelled: {
    label: "فاشلة / ملغاة",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: XCircle,
  },
};

const qatarDayRange = (day: Date) => {
  const dayStr = format(day, "yyyy-MM-dd");
  const start = fromZonedTime(`${dayStr}T00:00:00`, QATAR_TZ);
  const end = fromZonedTime(`${dayStr}T23:59:59.999`, QATAR_TZ);
  return { start: start.toISOString(), end: end.toISOString() };
};

const formatQatarDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = toZonedTime(new Date(iso), QATAR_TZ);
  return format(d, "dd/MM/yyyy hh:mm a");
};

const formatQatarDay = (iso: string) => {
  const d = toZonedTime(new Date(iso), QATAR_TZ);
  return format(d, "EEEE d MMMM yyyy", { locale: ar });
};

export const TransactionsTab = () => {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [dayFilter, setDayFilter] = useState<"all" | Date>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "confirmed" | "pending" | "cancelled">("all");
  // POS is hidden by default — Sadad and POS are shown as separate channels.
  const [methodFilter, setMethodFilter] = useState<"sadad" | "cash_pos">("sadad");
  const [search, setSearch] = useState("");
  // Live Sadad status filter — applied client-side after fetching Sadad data for the page.
  const [sadadStatusFilter, setSadadStatusFilter] = useState<"all" | "SUCCESS" | "REJECTED" | "INPROGRESS">("all");
  const [dayTotals, setDayTotals] = useState<{ confirmed: number; amount: number; count: number }>({
    confirmed: 0,
    amount: 0,
    count: 0,
  });
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [related, setRelated] = useState<RelatedOrder[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [sadadInfo, setSadadInfo] = useState<Record<string, SadadInfoState>>({});
  const [sadadSyncing, setSadadSyncing] = useState(false);

  const requestIdRef = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const buildQuery = useCallback(
    (withCount: boolean) => {
      let q = supabase
        .from("orders")
        .select(
          "id, customer_id, booking_reference, payment_id, payment_status, payment_method, ticket_type, quantity, total_amount, created_at, confirmed_at, payment_error_reason, customers(name, phone, email), events(title, event_date)",
          withCount ? { count: "exact" } : undefined
        )
        .order("created_at", { ascending: false });

      if (dayFilter !== "all") {
        const { start, end } = qatarDayRange(dayFilter);
        q = q.gte("created_at", start).lte("created_at", end);
      }
      if (statusFilter !== "all") q = q.eq("payment_status", statusFilter);
      q = q.eq("payment_method", methodFilter);


      const term = search.trim();
      if (term) {
        const like = `%${term}%`;
        q = q.or(`booking_reference.ilike.${like},payment_id.ilike.${like}`);
      }
      return q;
    },
    [dayFilter, statusFilter, methodFilter, search]
  );

  const fetchTransactions = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const { data, error, count } = await buildQuery(true).range(from, from + PAGE_SIZE - 1);
      if (requestId !== requestIdRef.current) return;
      if (error) throw error;
      setTransactions((data ?? []) as unknown as TransactionRow[]);
      setTotalCount(count ?? 0);

      // Totals for the current filter scope (confirmed only). Paged in chunks of
      // 1000 to bypass the backend's default row cap so sums stay accurate.
      const buildSumQuery = () => {
        let sumQuery = supabase
          .from("orders")
          .select("total_amount")
          .eq("payment_status", "confirmed");
        if (dayFilter !== "all") {
          const { start, end } = qatarDayRange(dayFilter);
          sumQuery = sumQuery.gte("created_at", start).lte("created_at", end);
        }
        sumQuery = sumQuery.eq("payment_method", methodFilter);
        const term = search.trim();
        if (term) {
          const like = `%${term}%`;
          sumQuery = sumQuery.or(`booking_reference.ilike.${like},payment_id.ilike.${like}`);
        }
        return sumQuery;
      };

      let confirmed = 0;
      let amount = 0;
      for (let startRow = 0; startRow < 20000; startRow += 1000) {
        const { data: sums } = await buildSumQuery().range(startRow, startRow + 999);
        if (requestId !== requestIdRef.current) return;
        const rows = (sums ?? []) as { total_amount: number }[];
        confirmed += rows.length;
        amount += rows.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
        if (rows.length < 1000) break;
      }
      setDayTotals({ confirmed, amount, count: count ?? 0 });
    } catch (e) {
      console.error("Error fetching transactions:", e);
      if (requestId === requestIdRef.current) {
        setTransactions([]);
        setTotalCount(0);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [buildQuery, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    setPage(0);
  }, [dayFilter, statusFilter, methodFilter, search]);

  // Sadad status filter only applies to the Sadad channel — reset it when leaving.
  useEffect(() => {
    if (methodFilter !== "sadad") setSadadStatusFilter("all");
  }, [methodFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);

  /** Rows after applying the live Sadad status filter (needs Sadad data fetched). */
  const visibleTransactions = useMemo(() => {
    if (sadadStatusFilter === "all") return transactions;
    return transactions.filter((t) => {
      const s = sadadInfo[t.id]?.tx;
      if (!s) return false;
      const st = s.status.toUpperCase();
      if (sadadStatusFilter === "REJECTED") return st === "REJECTED" || st === "FAILED";
      if (sadadStatusFilter === "INPROGRESS") return st === "INPROGRESS" || st === "IN PROGRESS" || st === "PENDING";
      return st === sadadStatusFilter;
    });
  }, [transactions, sadadInfo, sadadStatusFilter]);

  const sadadFilterActive = sadadStatusFilter !== "all";

  /** Fetch one order's live Sadad transaction (status, fees, net). */
  const fetchSadadInfo = useCallback(async (orderId: string) => {
    setSadadInfo((prev) => ({ ...prev, [orderId]: { loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke("sadad-transaction", {
        body: { orderId },
      });
      const payload = data as { success?: boolean; error?: string; transaction?: SadadTx } | null;
      if (error || !payload?.success || !payload.transaction) {
        throw new Error(payload?.error || "تعذر جلب بيانات سداد");
      }
      setSadadInfo((prev) => ({ ...prev, [orderId]: { loading: false, tx: payload.transaction } }));
    } catch (e) {
      setSadadInfo((prev) => ({
        ...prev,
        [orderId]: { loading: false, error: (e as Error).message || "خطأ" },
      }));
    }
  }, []);

  const openDetails = useCallback(async (tx: TransactionRow) => {
    setSelected(tx);
    setRelated([]);
    // Preload live Sadad data for the dialog so all API fields are visible.
    if (tx.payment_method === "sadad" && tx.payment_id) {
      fetchSadadInfo(tx.id);
    }
    if (!tx.customer_id) return;
    setRelatedLoading(true);
    try {
      const { data } = await supabase
        .from("orders")
        .select("id, booking_reference, payment_status, payment_method, total_amount, quantity, created_at")
        .eq("customer_id", tx.customer_id)
        .neq("id", tx.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setRelated((data ?? []) as RelatedOrder[]);
    } catch (e) {
      console.error("Error fetching related orders:", e);
    } finally {
      setRelatedLoading(false);
    }
  }, [fetchSadadInfo]);

  /** Fetch Sadad details for every row on the current page, 3 at a time. */
  const syncSadadPage = useCallback(async () => {
    const ids = transactions
      .filter((t) => t.payment_method === "sadad" && t.payment_id)
      .map((t) => t.id);
    if (ids.length === 0) return;
    setSadadSyncing(true);
    try {
      for (let i = 0; i < ids.length; i += 3) {
        await Promise.all(ids.slice(i, i + 3).map((id) => fetchSadadInfo(id)));
      }
    } finally {
      setSadadSyncing(false);
    }
  }, [transactions, fetchSadadInfo]);

  // When a Sadad status filter is chosen, make sure the page has Sadad data to filter on.
  useEffect(() => {
    if (sadadStatusFilter !== "all" && methodFilter === "sadad" && !loading && !sadadSyncing) {
      const missing = transactions.some(
        (t) => t.payment_method === "sadad" && t.payment_id && !sadadInfo[t.id]
      );
      if (missing) syncSadadPage();
    }
  }, [sadadStatusFilter, methodFilter, loading, sadadSyncing, transactions, sadadInfo, syncSadadPage]);

  const SadadCells = ({ tx }: { tx: TransactionRow }) => {
    const info = sadadInfo[tx.id];
    if (!tx.payment_id) {
      return (
        <>
          <TableCell className="text-xs text-muted-foreground">—</TableCell>
          <TableCell className="text-xs text-muted-foreground">—</TableCell>
          <TableCell className="text-xs text-muted-foreground">—</TableCell>
        </>
      );
    }
    if (info?.loading) {
      return (
        <TableCell colSpan={3}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </TableCell>
      );
    }
    if (info?.error) {
      return (
        <TableCell colSpan={3}>
          <button
            type="button"
            className="text-[11px] text-destructive underline"
            onClick={(e) => {
              e.stopPropagation();
              fetchSadadInfo(tx.id);
            }}
          >
            {info.error} — إعادة المحاولة
          </button>
        </TableCell>
      );
    }
    if (!info?.tx) {
      return (
        <TableCell colSpan={3}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              fetchSadadInfo(tx.id);
            }}
          >
            <RefreshCw className="ms-1 h-3 w-3" />
            جلب من سداد
          </Button>
        </TableCell>
      );
    }
    const s = info.tx;
    return (
      <>
        <TableCell>
          <Badge variant="outline" className={cn("font-medium", SADAD_STATUS_CLASS(s.status))}>
            {s.statusAr}
          </Badge>
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs tabular-nums text-amber-600">
          {qar(s.commission + s.refundCharge)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs font-semibold tabular-nums text-emerald-600">
          {qar(s.netAmount)}
        </TableCell>
      </>
    );
  };



  const StatusBadge = ({ status }: { status: string }) => {
    const meta = STATUS_META[status] ?? STATUS_META.pending;
    const Icon = meta.icon;
    return (
      <Badge variant="outline" className={cn("gap-1 font-medium", meta.className)}>
        <Icon className="h-3 w-3" />
        {meta.label}
      </Badge>
    );
  };


  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">المعاملات</h2>
            <p className="text-sm text-muted-foreground">
              {methodFilter === "sadad"
                ? "معاملات الدفع الإلكتروني عبر سداد"
                : "معاملات نقاط البيع (نقدي / POS)"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {methodFilter === "sadad" && (
            <Button variant="outline" size="sm" onClick={syncSadadPage} disabled={sadadSyncing || loading}>
              <CreditCard className={cn("ms-2 h-4 w-4", sadadSyncing && "animate-pulse")} />
              {sadadSyncing ? "جارٍ الجلب من سداد…" : "جلب حالة سداد للصفحة"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchTransactions} disabled={loading}>
            <RefreshCw className={cn("ms-2 h-4 w-4", loading && "animate-spin")} />
            تحديث
          </Button>
        </div>
      </div>

      {/* Channel switcher — POS is hidden until selected */}
      <div className="inline-flex rounded-xl border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMethodFilter("sadad")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            methodFilter === "sadad"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CreditCard className="h-4 w-4 text-primary" />
          سداد
        </button>
        <button
          type="button"
          onClick={() => setMethodFilter("cash_pos")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            methodFilter === "cash_pos"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Banknote className="h-4 w-4 text-amber-600" />
          نقدي / POS
        </button>
      </div>


      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المبلغ المؤكد</p>
              <p className="text-lg font-bold tabular-nums">
                {dayTotals.amount.toLocaleString("en-US")} ر.ق
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">معاملات ناجحة</p>
              <p className="text-lg font-bold tabular-nums">{dayTotals.confirmed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-muted p-2">
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المعاملات</p>
              <p className="text-lg font-bold tabular-nums">{dayTotals.count}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[220px] justify-start text-start font-normal",
                  dayFilter === "all" && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="ms-2 h-4 w-4" />
                {dayFilter === "all" ? "كل الأيام" : formatQatarDay(dayFilter.toISOString())}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dayFilter === "all" ? undefined : dayFilter}
                onSelect={(d) => d && setDayFilter(d)}
                initialFocus
                className="pointer-events-auto p-3"
              />
              {dayFilter !== "all" && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setDayFilter("all")}
                  >
                    عرض كل الأيام
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="confirmed">ناجحة</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="cancelled">فاشلة / ملغاة</SelectItem>
            </SelectContent>
          </Select>

          {methodFilter === "sadad" && (
            <Select
              value={sadadStatusFilter}
              onValueChange={(v) => setSadadStatusFilter(v as typeof sadadStatusFilter)}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="حالة سداد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل حالات سداد</SelectItem>
                <SelectItem value="SUCCESS">سداد: ناجحة</SelectItem>
                <SelectItem value="REJECTED">سداد: مرفوضة / فاشلة</SelectItem>
                <SelectItem value="INPROGRESS">سداد: قيد المعالجة</SelectItem>
              </SelectContent>
            </Select>
          )}




          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => setSearch(v), 300);
              }}
              placeholder="بحث برقم الحجز أو رقم المعاملة…"
              className="ps-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {dayFilter === "all"
              ? "كل المعاملات"
              : `معاملات يوم ${formatQatarDay(dayFilter.toISOString())}`}
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              ({totalCount.toLocaleString("en-US")})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              لا توجد معاملات مطابقة للفلاتر الحالية
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">رقم المعاملة</TableHead>
                    <TableHead className="text-start">رقم الحجز</TableHead>
                    <TableHead className="text-start">العميل</TableHead>
                    <TableHead className="text-start">الفعالية</TableHead>
                    <TableHead className="text-start">التذاكر</TableHead>
                    <TableHead className="text-start">المبلغ</TableHead>
                    <TableHead className="text-start">الطريقة</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    {methodFilter === "sadad" && (
                      <>
                        <TableHead className="text-start">حالة سداد</TableHead>
                        <TableHead className="text-start">عمولة سداد</TableHead>
                        <TableHead className="text-start">الصافي بعد الخصم</TableHead>
                      </>
                    )}
                    <TableHead className="text-start">التاريخ (قطر)</TableHead>
                    <TableHead className="text-start">تفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openDetails(tx)}
                    >

                      <TableCell className="font-mono text-xs" dir="ltr">
                        {tx.payment_id || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {tx.booking_reference}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {tx.customers?.name ?? "عميل غير معروف"}
                        </div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {tx.customers?.phone ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">
                        {tx.events?.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="tabular-nums">
                          {tx.quantity} × {tx.ticket_type === "vip" ? "VIP" : tx.ticket_type === "parking" ? "مواقف" : "عادي"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums">
                        {Number(tx.total_amount).toLocaleString("en-US")} ر.ق
                      </TableCell>
                      <TableCell>
                        {tx.payment_method === "sadad" ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <CreditCard className="h-3.5 w-3.5 text-primary" /> سداد
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Banknote className="h-3.5 w-3.5 text-amber-600" /> نقدي / POS
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tx.payment_status} />
                        {tx.payment_error_reason && (
                          <p className="mt-1 max-w-[160px] truncate text-[11px] text-destructive">
                            {tx.payment_error_reason}
                          </p>
                        )}
                      </TableCell>
                      {methodFilter === "sadad" && <SadadCells tx={tx} />}
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground" dir="ltr">
                        {formatQatarDateTime(tx.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetails(tx);
                          }}
                        >
                          <Eye className="ms-1 h-4 w-4" />
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>

                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                صفحة {page + 1} من {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction details */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              تفاصيل المعاملة
            </DialogTitle>
            <DialogDescription>
              كل بيانات الدفع والحجز المرتبطة بهذه المعاملة
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.payment_status} />
                <Badge variant="outline" className="gap-1">
                  {selected.payment_method === "sadad" ? (
                    <><CreditCard className="h-3 w-3 text-primary" /> سداد</>
                  ) : (
                    <><Banknote className="h-3 w-3 text-amber-600" /> نقدي / POS</>
                  )}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ["رقم المعاملة", selected.payment_id || "—", true],
                  ["رقم الحجز", selected.booking_reference, true],
                  ["العميل", selected.customers?.name ?? "عميل غير معروف", false],
                  ["الهاتف", selected.customers?.phone ?? "—", true],
                  ["البريد الإلكتروني", selected.customers?.email ?? "—", true],
                  ["الفعالية", selected.events?.title ?? "—", false],
                  [
                    "التذاكر",
                    `${selected.quantity} × ${
                      selected.ticket_type === "vip"
                        ? "VIP"
                        : selected.ticket_type === "parking"
                        ? "مواقف"
                        : "عادي"
                    }`,
                    false,
                  ],
                  ["المبلغ", `${Number(selected.total_amount).toLocaleString("en-US")} ر.ق`, false],
                  ["تاريخ الإنشاء (قطر)", formatQatarDateTime(selected.created_at), true],
                  ["تاريخ التأكيد (قطر)", formatQatarDateTime(selected.confirmed_at), true],
                ].map(([label, value, ltr]) => (
                  <div key={label as string} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{label as string}</p>
                    <p
                      className="mt-0.5 break-all text-sm font-medium"
                      dir={ltr ? "ltr" : undefined}
                    >
                      {value as string}
                    </p>
                  </div>
                ))}
              </div>

              {selected.payment_error_reason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {selected.payment_error_reason}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(`/invoice/${selected.booking_reference}`, "_blank", "noopener")
                  }
                >
                  <ExternalLink className="ms-2 h-4 w-4" />
                  فتح صفحة الفاتورة
                </Button>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">طلبات أخرى لنفس العميل</h4>
                {relatedLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : related.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد طلبات أخرى مرتبطة</p>
                ) : (
                  <div className="space-y-2">
                    {related.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-mono text-xs" dir="ltr">{r.booking_reference}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {formatQatarDateTime(r.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {Number(r.total_amount).toLocaleString("en-US")} ر.ق
                          </span>
                          <StatusBadge status={r.payment_status} />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              window.open(`/invoice/${r.booking_reference}`, "_blank", "noopener")
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

