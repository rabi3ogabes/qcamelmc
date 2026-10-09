import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdminSessionState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "not_admin"; userId: string }
  | { status: "admin"; userId: string };

type Session = { user: { id: string } } | null;

/** The slice of the Supabase client this hook needs (injectable for tests). */
export interface AdminClient {
  auth: {
    getSession(): Promise<{ data: { session: Session } }>;
    onAuthStateChange(cb: (event: string, session: Session) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
  rpc(fn: "is_admin", args: { user_id: string }): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Who is signed in, and are they an administrator? Admin-ness is decided by the
 * database (is_admin), never by anything stored in the browser. Any failure
 * counts as "not an admin".
 */
export function useAdminSession(client: AdminClient = supabase as unknown as AdminClient): AdminSessionState {
  const [state, setState] = useState<AdminSessionState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const evaluate = async (session: Session) => {
      if (!session?.user) {
        if (active) setState({ status: "signed_out" });
        return;
      }
      const userId = session.user.id;
      try {
        const { data, error } = await client.rpc("is_admin", { user_id: userId });
        if (active) setState(!error && data === true ? { status: "admin", userId } : { status: "not_admin", userId });
      } catch {
        if (active) setState({ status: "not_admin", userId });
      }
    };

    client.auth.getSession().then(({ data }) => evaluate(data.session), () => active && setState({ status: "signed_out" }));

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      // never call back into Supabase synchronously inside this callback
      setTimeout(() => void evaluate(session), 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  return state;
}
