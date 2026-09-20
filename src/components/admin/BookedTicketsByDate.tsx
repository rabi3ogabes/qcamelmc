import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  QrCode,
  Info,
  RefreshCw,
  Ticket,
  Crown,
  Car,
  CheckCircle2,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DateFilter = "today" | "tomorrow" | "custom" | "all";

interface BookedTicket {
  id: string;
  name: string;
  phone: string;
  ticket_type: string;
  qr_code: string | null;
  is_present: boolean | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  created_at: string | null;
  order: {
    id: string;
    booking_reference: string;
    payment_status: string | null;
    payment_method: string;
    total_amount: number;
    created_at: string | null;
    customers: { name: string; email: string; phone: string } | null;
    events: { title: string; event_date: string; location: string; is_archived: boolean };
  };
}

const qatarDateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const qatarDayRange = (key: string) => {
  // Qatar is UTC+3 — build the UTC bounds for that local day
  const start = new Date(`${key}T00:00:00+03:00`).toISOString();
  const end = new Date(`${key}T00:00:00+03:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end: end.toISOString() };
};

const typeIcon = (type: string) =>
  type === "vip" ? Crown : type === "parking" ? Car : Ticket;

const typeLabel = (type: string) =>
  type === "vip" ? "VIP" : type === "parking" ? "مواقف" : "عادي";

const typeBadgeClass = (type: string) =>
  type === "vip"
    ? "bg-amber-500/15 text-amber-700 border-amber-500/40"
    : type === "parking"
      ? "bg-blue-500/15 text-blue-700 border-blue-500/40"
      : "bg-primary/10 text-primary border-primary/30";

const paymentBadge = (status: string | null) => {
  if (status === "confirmed")
    return <Badge className="bg-success/15 text-success border-success/40 font-lusail">مدفوعة</Badge>;
  if (status === "pending")
    return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/40 font-lusail">قيد الانتظار</Badge>;
  return <Badge variant="destructive" className="font-lusail">فاشلة / ملغاة</Badge>;
};

export const BookedTicketsByDate = () => {
  const [filter, setFilter] = useState<DateFilter>("today");
  const [customDate, setCustomDate] = useState<string>(qatarDateKey(new Date()));
  const [tickets, setTickets] = useState<BookedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [qrDialog, setQrDialog] = useState<{ code: string; title: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [detailsTicket, setDetailsTicket] = useState<BookedTicket | null>(null);

  const selectedKey = useMemo(() => {
    const now = new Date();
    if (filter === "today") return qatarDateKey(now);
    if (filter === "tomorrow") {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      return qatarDateKey(t);
    }
    if (filter === "custom") return customDate;
    return null;
  }, [filter, customDate]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("ticket_holders")
        .select(
          `id, name, phone, ticket_type, qr_code, is_present, confirmed_at, confirmed_by_name, created_at,
           order:orders!inner(id, booking_reference, payment_status, payment_method, total_amount, created_at,
             customers(name, email, phone),
             events!inner(title, event_date, location, is_archived))`
        )
        .order("created_at", { ascending: false });

      if (selectedKey) {
        const { start, end } = qatarDayRange(selectedKey);
        query = query
          .gte("orders.events.event_date", start)
          .lt("orders.events.event_date", end);
      }

      // Page through everything (Supabase caps at 1000 rows)
      const pageSize = 1000;
      const rows: BookedTicket[] = [];
      for (let page = 0; page < 40; page++) {
        const from = page * pageSize;
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = ((data || []) as unknown as BookedTicket[]).filter((t) => t.order);
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      setTickets(rows);
    } catch (error) {
      console.error("Error fetching booked tickets:", error);
      toast.error("تعذر تحميل التذاكر المحجوزة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.order.booking_reference.toLowerCase().includes(q) ||
        (t.order.customers?.name || "").toLowerCase().includes(q) ||
        (t.order.customers?.phone || "").includes(q)
    );
  }, [tickets, search]);

  const openQr = async (ticket: BookedTicket) => {
    const code = ticket.qr_code || ticket.order.booking_reference;
    setQrDialog({ code, title: `${typeLabel(ticket.ticket_type)} — ${ticket.name}` });
    setQrDataUrl("");
    try {
      const url = await QRCode.toDataURL(code, { width: 512, margin: 1 });
      setQrDataUrl(url);
    } catch {
      toast.error("تعذر إنشاء رمز QR");
    }
  };

  const filterButton = (value: DateFilter, label: string) => (
    <Button
      key={value}
      variant={filter === value ? "default" : "ghost"}
      size="sm"
      className="font-lusail"
      onClick={() => setFilter(value)}
    >
      {label}
    </Button>
  );

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-lusail">التذاكر المحجوزة</h3>
            <p className="text-xs text-muted-foreground font-lusail">
              حسب تاريخ الفعالية — اضغط على رمز QR لعرضه مكبّراً أو على التفاصيل لعرض بيانات التذكرة
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} disabled={loading} className="font-lusail gap-1">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border p-1 bg-muted/40">
          {filterButton("today", "اليوم")}
          {filterButton("tomorrow", "غداً")}
          {filterButton("custom", "يوم محدد")}
          {filterButton("all", "الكل")}
        </div>
        {filter === "custom" && (
          <Input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-44 font-lusail"
            dir="ltr"
          />
        )}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو رقم الحجز…"
            className="pr-9 font-lusail"
          />
        </div>
        <Badge variant="secondary" className="font-lusail text-sm">
          {filtered.length} تذكرة
        </Badge>
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground font-lusail">جاري التحميل…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground font-lusail">
          لا توجد تذاكر محجوزة لهذا اليوم
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((ticket) => {
            const Icon = typeIcon(ticket.ticket_type);
            return (
              <div
                key={ticket.id}
                className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold font-lusail truncate">{ticket.name}</p>
                      <p className="text-xs text-muted-foreground font-lusail" dir="ltr">
                        {ticket.phone}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`font-lusail shrink-0 ${typeBadgeClass(ticket.ticket_type)}`}>
                    {typeLabel(ticket.ticket_type)}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-lusail text-muted-foreground">
                  <span dir="ltr">{ticket.order.booking_reference}</span>
                  <span>•</span>
                  <span>{ticket.order.events.title}</span>
                  {ticket.is_present && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-success font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        حاضر
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  {paymentBadge(ticket.order.payment_status)}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-lusail gap-1"
                      onClick={() => openQr(ticket)}
                      disabled={ticket.order.payment_status !== "confirmed"}
                      title={
                        ticket.order.payment_status !== "confirmed"
                          ? "رمز QR متاح للتذاكر المدفوعة فقط"
                          : "عرض رمز QR"
                      }
                    >
                      <QrCode className="w-4 h-4" />
                      QR
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="font-lusail gap-1"
                      onClick={() => setDetailsTicket(ticket)}
                    >
                      <Info className="w-4 h-4" />
                      التفاصيل
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enlarged QR dialog */}
      <Dialog open={!!qrDialog} onOpenChange={(open) => !open && setQrDialog(null)}>
        <DialogContent className="sm:max-w-md text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-lusail text-center">{qrDialog?.title}</DialogTitle>
            <DialogDescription className="font-lusail text-center" dir="ltr">
              {qrDialog?.code}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-72 h-72 rounded-xl border-4 border-primary/20 shadow-lg"
              />
            ) : (
              <div className="w-72 h-72 rounded-xl bg-muted/40 animate-pulse" />
            )}
          </div>
          <p className="text-xs text-muted-foreground font-lusail">وجّه الكاميرا نحو الرمز للمسح</p>
        </DialogContent>
      </Dialog>

      {/* Ticket details dialog */}
      <Dialog open={!!detailsTicket} onOpenChange={(open) => !open && setDetailsTicket(null)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-lusail">تفاصيل التذكرة</DialogTitle>
            <DialogDescription className="font-lusail" dir="ltr">
              {detailsTicket?.order.booking_reference}
            </DialogDescription>
          </DialogHeader>
          {detailsTicket && (
            <div className="space-y-4 font-lusail">
              <div className="grid grid-cols-2 gap-3">
                <Detail label="اسم حامل التذكرة" value={detailsTicket.name} />
                <Detail label="رقم الهاتف" value={detailsTicket.phone} ltr />
                <Detail label="نوع التذكرة" value={typeLabel(detailsTicket.ticket_type)} />
                <Detail
                  label="الحالة"
                  value={detailsTicket.is_present ? "حاضر ✓" : "لم تُمسح بعد"}
                />
                <Detail
                  label="العميل"
                  value={detailsTicket.order.customers?.name || "—"}
                />
                <Detail
                  label="بريد العميل"
                  value={detailsTicket.order.customers?.email || "—"}
                  ltr
                />
                <Detail label="الفعالية" value={detailsTicket.order.events.title} />
                <Detail
                  label="تاريخ الفعالية"
                  value={new Date(detailsTicket.order.events.event_date).toLocaleDateString("ar-u-nu-latn", {
                    timeZone: "Asia/Qatar",
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                />
                <Detail label="الموقع" value={detailsTicket.order.events.location} />
                <Detail
                  label="طريقة الدفع"
                  value={detailsTicket.order.payment_method === "sadad" ? "سداد (إلكتروني)" : "نقاط البيع"}
                />
                <Detail
                  label="المبلغ الإجمالي للحجز"
                  value={`${Number(detailsTicket.order.total_amount).toFixed(2)} ر.ق`}
                />
                <Detail
                  label="تاريخ الحجز"
                  value={
                    detailsTicket.order.created_at
                      ? new Date(detailsTicket.order.created_at).toLocaleString("ar-u-nu-latn", {
                          timeZone: "Asia/Qatar",
                        })
                      : "—"
                  }
                />
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">حالة الدفع:</span>
                {paymentBadge(detailsTicket.order.payment_status)}
              </div>
              {detailsTicket.is_present && detailsTicket.confirmed_at && (
                <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-sm">
                  تم المسح في{" "}
                  {new Date(detailsTicket.confirmed_at).toLocaleString("ar-u-nu-latn", {
                    timeZone: "Asia/Qatar",
                  })}
                  {detailsTicket.confirmed_by_name && ` — بواسطة ${detailsTicket.confirmed_by_name}`}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const Detail = ({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) => (
  <div className="rounded-lg bg-muted/40 p-2.5">
    <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
    <p className="text-sm font-semibold break-words" dir={ltr ? "ltr" : undefined}>
      {value}
    </p>
  </div>
);
