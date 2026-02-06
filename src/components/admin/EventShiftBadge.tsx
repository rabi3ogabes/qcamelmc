import { useState, useEffect } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface ShiftLog {
  created_at: string;
  old_event_title: string;
  old_event_date: string;
  new_event_title: string;
  new_event_date: string;
}

interface EventShiftBadgeProps {
  orderId: string;
}

export const EventShiftBadge = ({ orderId }: EventShiftBadgeProps) => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ShiftLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasShifts, setHasShifts] = useState<boolean | null>(null);

  // Check if this order has any expired QR codes (meaning it was shifted)
  const checkShifts = async () => {
    if (hasShifts !== null) return hasShifts;
    const { count } = await supabase
      .from("expired_qr_codes")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("reason", "event_date_changed");
    const result = (count || 0) > 0;
    setHasShifts(result);
    return result;
  };

  // Lazy check on first render
  useEffect(() => {
    checkShifts();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Try activity_logs first for detailed info
      const { data: activityData } = await supabase
        .from("activity_logs")
        .select("created_at, action_data")
        .eq("activity_type", "event_change")
        .order("created_at", { ascending: true });

      const orderLogs = (activityData || []).filter((log: any) => {
        const data = log.action_data as any;
        return data?.order_id === orderId;
      });

      if (orderLogs.length > 0) {
        setLogs(
          orderLogs.map((log: any) => {
            const data = log.action_data as any;
            return {
              created_at: log.created_at,
              old_event_title: data.old_event_title || "غير معروف",
              old_event_date: data.old_event_date || "",
              new_event_title: data.new_event_title || "غير معروف",
              new_event_date: data.new_event_date || "",
            };
          })
        );
      } else {
        // Fallback: show expired QR timestamps
        const { data: expiredData } = await supabase
          .from("expired_qr_codes")
          .select("created_at")
          .eq("order_id", orderId)
          .eq("reason", "event_date_changed")
          .order("created_at", { ascending: true });

        // Group by timestamp (same batch = same change)
        const grouped = new Map<string, string>();
        (expiredData || []).forEach((item: any) => {
          const key = item.created_at.substring(0, 19); // group by second
          if (!grouped.has(key)) grouped.set(key, item.created_at);
        });

        setLogs(
          Array.from(grouped.values()).map((ts) => ({
            created_at: ts,
            old_event_title: "غير معروف",
            old_event_date: "",
            new_event_title: "غير معروف",
            new_event_date: "",
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching shift logs:", error);
    } finally {
      setLoading(false);
    }
  };

  if (hasShifts === null || hasShifts === false) return null;

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          fetchLogs();
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors text-xs font-medium"
        title="تم تغيير تاريخ الفعالية"
      >
        <ArrowRightLeft className="w-3 h-3" />
        تم النقل
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-lusail flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-amber-600" />
              سجل تغيير الفعالية
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">لا توجد سجلات</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      تغيير #{index + 1}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ar })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex-1 bg-red-50 dark:bg-red-950/20 rounded p-2 text-center">
                      <p className="text-xs text-muted-foreground mb-1">من</p>
                      <p className="font-medium text-red-700 dark:text-red-400">
                        {log.old_event_date
                          ? format(new Date(log.old_event_date), "dd/MM/yyyy")
                          : log.old_event_title}
                      </p>
                      {log.old_event_date && log.old_event_title !== "غير معروف" && (
                        <p className="text-xs text-muted-foreground mt-1">{log.old_event_title}</p>
                      )}
                    </div>

                    <ArrowRightLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                    <div className="flex-1 bg-green-50 dark:bg-green-950/20 rounded p-2 text-center">
                      <p className="text-xs text-muted-foreground mb-1">إلى</p>
                      <p className="font-medium text-green-700 dark:text-green-400">
                        {log.new_event_date
                          ? format(new Date(log.new_event_date), "dd/MM/yyyy")
                          : log.new_event_title}
                      </p>
                      {log.new_event_date && log.new_event_title !== "غير معروف" && (
                        <p className="text-xs text-muted-foreground mt-1">{log.new_event_title}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
