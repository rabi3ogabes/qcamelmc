import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Archive, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { paymentErrorSourceLabel } from "@/lib/paymentErrors";

interface PaymentErrorRow {
  id: string;
  created_at: string;
  order_id: string | null;
  booking_reference: string | null;
  event_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  quantity: number | null;
  amount: number | null;
  payment_id: string | null;
  error_source: string;
  error_code: string | null;
  error_message: string | null;
  events?: { title: string | null; event_date: string | null; is_archived: boolean } | null;
}

const QATAR_TZ = "Asia/Qatar";

const formatQatarDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ar-u-nu-latn", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const sourceBadgeClass = (source: string) => {
  switch (source) {
    case "sadad":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "bank":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

export const PaymentErrorsTab = () => {
  const [rows, setRows] = useState<PaymentErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"current" | "archived">("current");
  const [sourceFilter, setSourceFilter] = useState<"all" | "sadad" | "bank" | "site">("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("payment_errors")
        .select(
          "id, created_at, order_id, booking_reference, event_id, customer_name, customer_phone, quantity, amount, payment_id, error_source, error_code, error_message, events(title, event_date, is_archived)",
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setRows((data as unknown as PaymentErrorRow[]) || []);
    } catch (error) {
      console.error("Failed to load payment errors:", error);
      toast.error("فشل في تحميل أخطاء الدفع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel("payment_errors_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_errors" },
        () => fetchRows(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRows]);

  const deleteRow = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from("payment_errors").delete().eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("تم حذف السجل");
    } catch (error) {
      console.error("Failed to delete payment error:", error);
      toast.error("فشل في حذف السجل");
    } finally {
      setDeleting(null);
    }
  };

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const archived = row.events?.is_archived === true;
      if (view === "current" ? archived : !archived) return false;
      if (sourceFilter !== "all" && row.error_source !== sourceFilter) return false;
      if (!term) return true;
      return [row.customer_name, row.customer_phone, row.booking_reference, row.payment_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, view, sourceFilter, search]);

  const counts = useMemo(() => {
    const base = rows.filter((row) =>
      view === "current" ? row.events?.is_archived !== true : row.events?.is_archived === true,
    );
    return {
      all: base.length,
      sadad: base.filter((r) => r.error_source === "sadad").length,
      bank: base.filter((r) => r.error_source === "bank").length,
      site: base.filter((r) => r.error_source === "site").length,
    };
  }, [rows, view]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6" dir="rtl">
      <Card className="p-4 md:p-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div className="text-right">
            <h2 className="text-xl md:text-2xl font-bold mb-1 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              أخطاء الدفع
            </h2>
            <p className="text-sm text-muted-foreground">
              كل محاولة دفع فاشلة مع الاسم والوقت وعدد التذاكر والمبلغ وسبب الرفض
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              <Button
                variant={view === "current" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setView("current")}
              >
                الحالية
              </Button>
              <Button
                variant={view === "archived" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setView("archived")}
              >
                <Archive className="w-4 h-4 ml-1" />
                الأرشيف
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRows}>
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {([
            ["all", `الكل (${counts.all})`],
            ["sadad", `سداد (${counts.sadad})`],
            ["bank", `البنك / البطاقة (${counts.bank})`],
            ["site", `الموقع (${counts.site})`],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={sourceFilter === value ? "default" : "outline"}
              onClick={() => setSourceFilter(value)}
            >
              {label}
            </Button>
          ))}

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف أو رقم الحجز"
              className="pr-9"
            />
          </div>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right whitespace-nowrap">الوقت</TableHead>
                <TableHead className="text-right whitespace-nowrap">العميل</TableHead>
                <TableHead className="text-right whitespace-nowrap">الهاتف</TableHead>
                <TableHead className="text-right whitespace-nowrap">التذاكر</TableHead>
                <TableHead className="text-right whitespace-nowrap">المبلغ</TableHead>
                <TableHead className="text-right whitespace-nowrap">المصدر</TableHead>
                <TableHead className="text-right">سبب الخطأ</TableHead>
                <TableHead className="text-right whitespace-nowrap">رقم الحجز</TableHead>
                <TableHead className="text-right whitespace-nowrap">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    لا توجد أخطاء دفع مسجّلة
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap" dir="ltr">
                      {formatQatarDateTime(row.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">{row.customer_name || "—"}</TableCell>
                    <TableCell className="text-xs" dir="ltr">
                      {row.customer_phone || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row.quantity ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.amount != null ? `${Number(row.amount).toFixed(2)} ر.ق` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${sourceBadgeClass(row.error_source)}`}>
                        {paymentErrorSourceLabel(row.error_source)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[320px]">
                      <div className="line-clamp-3">{row.error_message || row.error_code || "—"}</div>
                      {row.events?.title && (
                        <div className="text-[11px] text-muted-foreground mt-1">{row.events.title}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs" dir="ltr">
                      {row.booking_reference || "—"}
                      {row.payment_id && (
                        <div className="text-[11px] text-muted-foreground">{row.payment_id}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRow(row.id)}
                        disabled={deleting === row.id}
                      >
                        {deleting === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-destructive" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
