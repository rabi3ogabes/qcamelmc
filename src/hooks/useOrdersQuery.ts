import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode } from "@/lib/staffAccess";

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
  payment_id?: string | null;
  payment_error_reason?: string | null;
  /** Why the order is in its state (e.g. "expired", "paid_after_expiry_no_stock"). */
  payment_note?: string | null;
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
  /** Qatar "YYYY-MM-DD" of the first festival day; null = no festival. */
  festivalFrom: string | null;
  /** Qatar "YYYY-MM-DD" after the last festival day (exclusive); null = no festival. */
  festivalToExclusive: string | null;
  page: number;
  pageSize: number;
}

export interface OrdersStats {
  success: number;
  failed: number;
  methodAll: number;
  methodSadad: number;
  methodCashPos: number;
}

const EMPTY_STATS: OrdersStats = { success: 0, failed: 0, methodAll: 0, methodSadad: 0, methodCashPos: 0 };

export const useOrdersQuery = (params: OrdersQueryParams) => {
  const [orders, setOrders] = useState<OrdersQueryOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OrdersStats>(EMPTY_STATS);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const { status, paymentMethod, eventId, search, upcomingOnly, page, pageSize } = params;
  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke("staff-orders", {
        body: { status, paymentMethod, eventId, search, upcomingOnly, page, pageSize, passcode: getStaffPasscode() },
      });
      if (requestError) throw requestError;
      if (requestId !== requestIdRef.current) return;
      setOrders(data.orders ?? []);
      setTotalCount(data.totalCount ?? 0);
      setStats(data.stats ?? EMPTY_STATS);
      setCanManage(data.canManage === true);
      setError(null);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setOrders([]);
      setTotalCount(0);
      setStats(EMPTY_STATS);
      setCanManage(false);
      setError("تعذر تحميل الطلبات، حاول مجددًا أو أعد تسجيل الدخول");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [status, paymentMethod, eventId, search, upcomingOnly, page, pageSize]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { orders, totalCount, stats, loading, refresh, canManage, error };
};
