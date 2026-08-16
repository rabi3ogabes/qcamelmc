import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, MailCheck, MailX, Clock, RotateCcw, ShieldAlert, Undo2 } from "lucide-react";

export interface EmailDeliveryEvent {
  id: string;
  status: string;
  attempt: number;
  detail: string | null;
  recipient: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; icon: typeof Clock; className: string; dot: string }> = {
  queued: { label: "في قائمة الإرسال", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  retried: { label: "إعادة محاولة", icon: RotateCcw, className: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
  sent: { label: "تم الإرسال", icon: MailCheck, className: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  failed: { label: "فشل الإرسال", icon: MailX, className: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  suppressed: { label: "محظور من الاستقبال", icon: ShieldAlert, className: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400" },
  bounced: { label: "ارتد البريد", icon: MailX, className: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  complained: { label: "بلاغ إزعاج", icon: ShieldAlert, className: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  unsubscribed: { label: "إلغاء الاشتراك", icon: Undo2, className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString("ar-u-nu-latn", {
    timeZone: "Asia/Qatar",
    dateStyle: "medium",
    timeStyle: "short",
  });

export const statusMeta = (status: string) =>
  STATUS_META[status] ?? { label: status, icon: Clock, className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };

export const EmailDeliveryTimeline = ({ orderId }: { orderId: string }) => {
  const [events, setEvents] = useState<EmailDeliveryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("email_delivery_events")
        .select("id, status, attempt, detail, recipient, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) console.error("Failed to load email events:", error);
      setEvents((data as EmailDeliveryEvent[]) || []);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`email-events-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_delivery_events", filter: `order_id=eq.${orderId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        لم يتم إرسال أي فاتورة بالبريد لهذا الحجز بعد.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-r border-border pr-5">
      {events.map((event) => {
        const meta = statusMeta(event.status);
        const Icon = meta.icon;
        return (
          <li key={event.id} className="relative">
            <span className={`absolute -right-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background ${meta.dot}`} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`gap-1 rounded-full ${meta.className}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatTime(event.created_at)}</span>
              {event.attempt > 1 && (
                <span className="text-xs text-muted-foreground">• المحاولة {event.attempt}</span>
              )}
            </div>
            {event.detail && <p className="mt-1 text-xs text-muted-foreground break-words">{event.detail}</p>}
            {event.recipient && <p className="text-xs text-muted-foreground/80" dir="ltr">{event.recipient}</p>}
          </li>
        );
      })}
    </ol>
  );
};
