import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { rememberOrder } from "@/lib/payment";

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

/**
 * Sadad sends the customer back here (on the registered domain) with the
 * payment result in the address. This page only forwards those values to the
 * server, which verifies them with Sadad; it never decides anything itself.
 */
const SadadReturn = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = ["ORDERID", "ORDER_ID", "website_ref_no", "websiteRefNo", "ref"]
      .map((k) => params.get(k)?.trim() ?? "")
      .find((v) => REFERENCE.test(v));
    if (ref) rememberOrder(ref);

    const target = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/sadad-callback?${params.toString()}`;
    const done = () => navigate(ref ? `/payment/result?ref=${encodeURIComponent(ref)}` : "/payment/result", { replace: true });
    // no-cors: the server processes the result; the browser only needs to wait for it
    fetch(target, { method: "GET", mode: "no-cors", redirect: "manual" }).catch(() => undefined).finally(done);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center" dir="rtl">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="جارٍ التحقق من الدفع" />
    </div>
  );
};

export default SadadReturn;
