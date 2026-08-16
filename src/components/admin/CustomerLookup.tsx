import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, UserCheck, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { searchCustomers, dedupeCustomers } from "@/lib/customerLookup";
import { getPersonEventHistory, formatHistoryDate, PersonEventHistoryItem } from "@/lib/personEventHistory";

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
  const [histories, setHistories] = useState<Record<string, PersonEventHistoryItem[]>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const performSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setSearched(false);
      setHistories({});
      return;
    }
    setSearching(true);
    setSearched(true);
    try {
      const found = dedupeCustomers(await searchCustomers(trimmed)) as LookupCustomer[];
      setResults(found);

      if (found.length > 0) {
        const entries = await Promise.all(
          found.map(async (c) => [
            c.id,
            await getPersonEventHistory(c.id_number, `${c.country_code || ""}${c.phone}`),
          ] as const)
        );
        setHistories(Object.fromEntries(entries));
      } else {
        setHistories({});
      }
    } catch (error) {
      console.error("Customer lookup failed:", error);
      toast.error("تعذر البحث عن العميل");
    } finally {
      setSearching(false);
    }
  }, [eventId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setHistories({});
  };


  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برقم الهاتف"
          className="font-lusail"
        />
        <Button
          type="button"
          variant="outline"
          onClick={clearSearch}
          disabled={!query && results.length === 0}
          className="font-lusail gap-2 shrink-0"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          مسح
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
