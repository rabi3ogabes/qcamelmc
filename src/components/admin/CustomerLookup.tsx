import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, UserCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getRemainingAllowance, MAX_TICKETS_PER_PERSON } from "@/lib/ticketLimit";

export interface LookupCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  country_code: string | null;
  nationality: string | null;
  id_number: string | null;
}

interface CustomerLookupProps {
  onSelect: (customer: LookupCustomer) => void;
  /** When provided, each result shows how many tickets the person may still take for this event. */
  eventId?: string | null;
}

export const CustomerLookup = ({ onSelect, eventId }: CustomerLookupProps) => {
  const [allowances, setAllowances] = useState<Record<string, number | null>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    const term = query.trim();
    if (term.length < 3) {
      toast.error("أدخل 3 أحرف أو أرقام على الأقل");
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, country_code, nationality, id_number")
        .or(`phone.ilike.%${term}%,id_number.ilike.%${term}%,name.ilike.%${term}%`)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      const found = (data || []) as LookupCustomer[];
      setResults(found);
      setSearched(true);

      if (eventId && found.length > 0) {
        const entries = await Promise.all(
          found.map(async (c) => [
            c.id,
            await getRemainingAllowance(c.id_number, `${c.country_code || ""}${c.phone}`, eventId),
          ] as const)
        );
        setAllowances(Object.fromEntries(entries));
      } else {
        setAllowances({});
      }
    } catch (error) {
      console.error("Customer lookup failed:", error);
      toast.error("تعذر البحث عن العميل");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="ابحث بالاسم أو رقم الهاتف أو رقم الهوية"
          className="font-lusail"
        />
        <Button type="button" variant="outline" onClick={search} disabled={searching} className="font-lusail gap-2">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          بحث
        </Button>
      </div>

      {searched && results.length === 0 && !searching && (
        <p className="text-sm text-muted-foreground font-lusail">لا يوجد عميل مطابق — تابع بإدخال البيانات يدوياً</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {results.map((customer) => (
            <Card
              key={customer.id}
              className="p-3 flex items-center justify-between gap-3 hover:border-primary transition-colors"
            >
              <div className="min-w-0">
                <p className="font-lusail font-bold truncate">{customer.name}</p>
                <p className="text-xs text-muted-foreground font-lusail" dir="ltr">
                  {customer.country_code || "+974"}
                  {customer.phone}
                  {customer.id_number ? ` · ${customer.id_number}` : ""}
                </p>
                {allowances[customer.id] !== undefined && allowances[customer.id] !== null && (
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-lusail font-bold ${
                      allowances[customer.id] === 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {allowances[customer.id] === 0
                      ? `بلغ الحد الأقصى (${MAX_TICKETS_PER_PERSON} تذاكر)`
                      : `متبقٍ له ${allowances[customer.id]} تذكرة`}
                  </span>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                className="font-lusail gap-1 shrink-0"
                onClick={() => {
                  onSelect(customer);
                  setResults([]);
                  setQuery("");
                  setSearched(false);
                  toast.success(`تم تعبئة بيانات ${customer.name}`);
                }}
              >
                <UserCheck className="w-4 h-4" />
                استخدام
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
