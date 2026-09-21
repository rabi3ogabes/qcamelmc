import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Loader2 } from "lucide-react";

type AuthorizationDetails = {
  client?: { name?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

/** Consent screen shown when an AI assistant asks to connect to this system. */
const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("رابط غير مكتمل: authorization_id مفقود");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/admin/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error: detailsError } = await oauth().getAuthorizationDetails(
        authorizationId,
      );
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("لم يتم استلام رابط العودة من خادم التفويض");
      return;
    }
    window.location.href = target;
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/60 bg-card/80 p-8 text-center shadow-[var(--shadow-elegant)] backdrop-blur-xl">
        <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>

        {error ? (
          <>
            <h1 className="text-xl font-bold">تعذّر إتمام الربط</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري التحميل...
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold">
              ربط {details.client?.name ?? "تطبيق"} بحسابك
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              سيتمكّن {details.client?.name ?? "التطبيق"} من قراءة بيانات النظام بالصلاحيات
              نفسها التي يملكها حسابك.
            </p>
            <div className="mt-7 flex gap-3">
              <Button className="flex-1" size="lg" disabled={busy} onClick={() => decide(true)}>
                {busy ? "..." : "موافقة"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                disabled={busy}
                onClick={() => decide(false)}
              >
                رفض
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default OAuthConsent;
