import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toZonedTime } from "date-fns-tz";

export interface OrdersQueryOrder {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  event_id: string;
  sadad_manually_verified?: boolean;
  payment_error_reason?: string | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    nationality?: string;
  } | null;
  events?: {
    title: string;
    event_date: string;
    location: string;
  };
  pos_users?: { name: string; icon: string | null } | null;
  ticket_holders?: { ticket_type: string }[];
}

export interface OrdersQueryParams {
  status: "success" | "failed";
  paymentMethod: "all" | "sadad" | "cash_pos";
  eventId: string;
  search: string;
  upcomingOnly: boolean;
  page: number;
  pageSize: number;
}

const SELECT_FIELDS =
  "id, booking_reference, payment_status, payment_method, ticket_type, quantity, total_amount, created_at, event_id, sadad_manually_verified, payment_error_reason, customers(name, email, phone, nationality), events!inner(title, event_date, location), pos_users(name, icon), ticket_holders(ticket_type)";

const sel = (s: string): string => s;

const getTodayQatar = () => {
  const qatarNow = toZonedTime(new Date(), "Asia/Qatar");
  const year = qatarNow.getFullYear();
  const month = String(qatarNow.getMonth() + 1).padStart(2, "0");
  const day = String(qatarNow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type AnyBuilder = any;

const applyCommonFilters = (
  query: AnyBuilder,
  params: Pick<OrdersQueryParams, "paymentMethod" | "eventId" | "upcomingOnly">
) => {
  let q = query;
  if (params.upcomingOnly) q = q.gte("events.event_date", getTodayQatar());
  if (params.paymentMethod !== "all") q = q.eq("payment_method", params.paymentMethod);
  if (params.eventId !== "all") q = q.eq("event_id", params.eventId);
  return q;
};

const applyStatusFilter = (query: AnyBuilder, status: "success" | "failed") =>
  status === "success"
    ? query.eq("payment_status", "confirmed")
    : query.in("payment_status", ["cancelled", "pending"]);

export interface OrdersStats {
  success: number;
  failed: number;
  methodAll: number;
  methodSadad: number;
  methodCashPos: number;
}

export const useOrdersQuery = (params: OrdersQueryParams) => {
  const [orders, setOrders] = useState<OrdersQueryOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OrdersStats>({
    success: 0,
    failed: 0,
    methodAll: 0,
    methodSadad: 0,
    methodCashPos: 0,
  });
  const requestIdRef = useRef(0);

  const { status, paymentMethod, eventId, search, upcomingOnly, page, pageSize } = params;

  const fetchPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const term = search.trim();

      if (term) {
        // Search across booking reference OR customer name/phone (two lean queries, merged).
        const like = `%${term}%`;

        const byRefQuery = applyStatusFilter(
          applyCommonFilters(
            supabase.from("orders").select(sel(SELECT_FIELDS)),
            { paymentMethod, eventId, upcomingOnly }
          ),
          status
        )
          .ilike("booking_reference", like)
          .order("created_at", { ascending: false })
          .limit(100);

        const byCustomerQuery = applyStatusFilter(
          applyCommonFilters(
            supabase
              .from("orders")
              .select(sel(SELECT_FIELDS.replace("customers(", "customers!inner("))),
            { paymentMethod, eventId, upcomingOnly }
          ),
          status
        )
          .or(`name.ilike.${like},phone.ilike.${like}`, { referencedTable: "customers" })
          .order("created_at", { ascending: false })
          .limit(100);

        const [refRes, custRes] = await Promise.all([byRefQuery, byCustomerQuery]);
        if (requestId !== requestIdRef.current) return;
        if (refRes.error) throw refRes.error;
        if (custRes.error) throw custRes.error;

        const map = new Map<string, OrdersQueryOrder>();
        [...((refRes.data ?? []) as unknown as OrdersQueryOrder[]),
         ...((custRes.data ?? []) as unknown as OrdersQueryOrder[])].forEach((o) => map.set(o.id, o));
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setOrders(merged);
        setTotalCount(merged.length);
        return;
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;

      const listQuery = applyStatusFilter(
        applyCommonFilters(
          supabase.from("orders").select(sel(SELECT_FIELDS), { count: "exact" }),
          { paymentMethod, eventId, upcomingOnly }
        ),
        status
      )
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, error, count } = await listQuery;
      if (requestId !== requestIdRef.current) return;
      if (error) throw error;

      setOrders((data ?? []) as unknown as OrdersQueryOrder[]);
      setTotalCount(count ?? 0);
    } catch (error) {
      console.error("Error fetching orders page:", error);
      if (requestId === requestIdRef.current) {
        setOrders([]);
        setTotalCount(0);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [status, paymentMethod, eventId, search, upcomingOnly, page, pageSize]);

  const fetchStats = useCallback(async () => {
    try {
      const head = () =>
        supabase.from("orders").select(sel("id, events!inner(event_date)"), {
          count: "exact",
          head: true,
        });

      const base = (method: "all" | "sadad" | "cash_pos") =>
        applyCommonFilters(head(), { paymentMethod: method, eventId, upcomingOnly });

      const [successRes, failedRes, allRes, sadadRes, posRes] = await Promise.all([
        applyStatusFilter(base(paymentMethod), "success"),
        applyStatusFilter(base(paymentMethod), "failed"),
        applyStatusFilter(base("all"), "success"),
        applyStatusFilter(base("sadad"), "success"),
        applyStatusFilter(base("cash_pos"), "success"),
      ]);

      setStats({
        success: successRes.count ?? 0,
        failed: failedRes.count ?? 0,
        methodAll: allRes.count ?? 0,
        methodSadad: sadadRes.count ?? 0,
        methodCashPos: posRes.count ?? 0,
      });
    } catch (error) {
      console.error("Error fetching order stats:", error);
    }
  }, [paymentMethod, eventId, upcomingOnly]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refresh = useCallback(() => {
    fetchPage();
    fetchStats();
  }, [fetchPage, fetchStats]);

  // Realtime: refresh only the current page, debounced.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const debouncedRefresh = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 1500);
    };

    const channel = supabase
      .channel("orders-page-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, debouncedRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_holders" },
        debouncedRefresh
      )
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { orders, totalCount, stats, loading, refresh };
};
