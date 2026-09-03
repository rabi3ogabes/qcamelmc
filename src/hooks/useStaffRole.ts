import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StaffRole = "admin" | "moderator" | null;

/** Resolves the signed-in user's staff role (admin > moderator). */
export const useStaffRole = () => {
  const [role, setRole] = useState<StaffRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const resolve = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) { setRole(null); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const roles = (data || []).map((r: { role: string }) => r.role);
      if (!active) return;
      setRole(roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : null);
      setLoading(false);
    };

    resolve();
    const { data: sub } = supabase.auth.onAuthStateChange(() => resolve());
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { role, loading, isAdmin: role === "admin", isModerator: role === "moderator" };
};

/** Resolves a role once (no subscription) — handy right after sign-in. */
export const fetchStaffRole = async (userId: string): Promise<StaffRole> => {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data || []).map((r: { role: string }) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("moderator")) return "moderator";
  return null;
};
