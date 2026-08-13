import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, UserCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

export const CustomerLookup = ({ onSelect }: CustomerLookupProps) => {
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
      setResults((data || []) as LookupCustomer[]);
      setSearched(true);
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
