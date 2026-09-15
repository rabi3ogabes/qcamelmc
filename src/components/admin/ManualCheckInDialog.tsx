import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode } from "@/lib/staffAccess";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  UserCheck,
  CheckCircle2,
  Crown,
  Ticket as TicketIcon,
  Car,
  Phone,
  Mail,
  Hash,
} from "lucide-react";

interface SearchResult {
  holder_id: string;
  name: string;
  phone: string;
  id_number: string | null;
  ticket_type: string;
  is_present: boolean;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  event_title: string;
  event_date: string;
  is_today: boolean;
}

interface ManualCheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffName?: string | null;
}

const typeMeta: Record<string, { label: string; icon: typeof Crown; className: string }> = {
  vip: { label: "VIP", icon: Crown, className: "bg-[hsl(var(--ticket-vip))]/15 text-[hsl(var(--ticket-vip))] border-[hsl(var(--ticket-vip))]/30" },
  normal: { label: "عادي", icon: TicketIcon, className: "bg-[hsl(var(--ticket-normal))]/15 text-[hsl(var(--ticket-normal))] border-[hsl(var(--ticket-normal))]/30" },
  parking: { label: "مواقف", icon: Car, className: "bg-[hsl(var(--ticket-parking))]/15 text-[hsl(var(--ticket-parking))] border-[hsl(var(--ticket-parking))]/30" },
};

export const ManualCheckInDialog = ({ open, onOpenChange, staffName }: ManualCheckInDialogProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSearched(false);
      setPendingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ticket-checkin", {
          body: { mode: "search", search: term, passcode: getStaffPasscode() },
        });
        if (error) throw error;
        setResults((data?.results || []) as SearchResult[]);
        setSearched(true);
      } catch (err) {
        console.error("Manual check-in search failed:", err);
        toast.error("تعذر البحث، حاول مرة أخرى");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open]);

  const markPresent = async (holder: SearchResult) => {
    setPendingId(holder.holder_id);
    try {
      const { data, error } = await supabase.functions.invoke("ticket-checkin", {
        body: {
          mode: "manual",
          holder_id: holder.holder_id,
          staff_name: staffName || undefined,
          passcode: getStaffPasscode(),
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "تم تسجيل الحضور");
        setResults((prev) =>
          prev.map((r) =>
            r.holder_id === holder.holder_id
              ? { ...r, is_present: true, confirmed_at: data.confirmed_at, confirmed_by_name: staffName || null }
              : r
          )
        );
      } else {
        toast.error(data?.message || "تعذر تسجيل الحضور");
        if (data?.already) {
          setResults((prev) =>
            prev.map((r) => (r.holder_id === holder.holder_id ? { ...r, is_present: true } : r))
          );
        }
      }
    } catch (err) {
      console.error("Manual check-in failed:", err);
      toast.error("تعذر تسجيل الحضور");
    } finally {
      setPendingId(null);
    }
  };

  const presentCount = useMemo(() => results.filter((r) => r.is_present).length, [results]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl p-0 overflow-hidden border-primary/20">
        <div className="bg-gradient-to-l from-primary/10 via-background to-background px-6 pt-6 pb-4 border-b">
          <DialogHeader className="space-y-1 text-right">
            <DialogTitle className="flex items-center gap-2 text-xl font-lusail">
              <UserCheck className="w-5 h-5 text-primary" />
              تسجيل الحضور اليدوي
            </DialogTitle>
            <p className="text-sm text-muted-foreground font-lusail">
              ابحث برقم الهاتف أو الاسم أو البريد أو رقم الحجز، ثم سجّل الحضور بلمسة واحدة
            </p>
          </DialogHeader>

          <div className="relative mt-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="مثال: 66793776 أو أحمد أو QTR-..."
              className="pr-9 h-12 font-lusail text-base"
            />
            {loading && (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
            )}
          </div>

          {results.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground font-lusail">
              {results.length} تذكرة · {presentCount} حاضر
            </p>
          )}
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-4 py-4 space-y-3">
          {searched && !loading && results.length === 0 && (
            <div className="text-center py-10 text-muted-foreground font-lusail">
              لا توجد تذاكر مطابقة لهذا البحث
            </div>
          )}

          {!searched && !loading && (
            <div className="text-center py-10 text-muted-foreground font-lusail text-sm">
              اكتب حرفين على الأقل لبدء البحث
            </div>
          )}

          {results.map((r) => {
            const meta = typeMeta[r.ticket_type] || typeMeta.normal;
            const Icon = meta.icon;
            return (
              <div
                key={r.holder_id}
                className="rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-lusail font-bold text-base truncate">{r.name}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-lusail ${meta.className}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {r.is_present ? (
                        <Badge className="bg-green-600 hover:bg-green-600 text-white font-lusail text-[11px]">
                          حاضر
                        </Badge>
                      ) : !r.is_today ? (
                        <Badge variant="outline" className="font-lusail text-[11px]">
                          ليست لليوم
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-lusail">
                      <span className="inline-flex items-center gap-1" dir="ltr">
                        <Phone className="w-3 h-3" />
                        {r.phone || r.customer_phone}
                      </span>
                      {r.customer_email && (
                        <span className="inline-flex items-center gap-1 truncate" dir="ltr">
                          <Mail className="w-3 h-3" />
                          {r.customer_email}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1" dir="ltr">
                        <Hash className="w-3 h-3" />
                        {r.booking_reference}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground font-lusail truncate">
                      {r.event_title} · العميل: {r.customer_name}
                    </p>

                    {r.is_present && r.confirmed_by_name && (
                      <p className="text-[11px] text-green-700 font-lusail">
                        سُجّل بواسطة {r.confirmed_by_name}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {r.is_present ? (
                      <span className="inline-flex items-center gap-1 text-green-600 font-lusail text-sm">
                        <CheckCircle2 className="w-5 h-5" />
                        تم
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="font-lusail gap-1"
                        disabled={pendingId === r.holder_id}
                        onClick={() => markPresent(r)}
                      >
                        {pendingId === r.holder_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                        تسجيل الحضور
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
