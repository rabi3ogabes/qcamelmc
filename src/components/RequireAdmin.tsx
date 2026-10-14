import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getStaffPasscode, hasStaffAccess } from "@/lib/staffAccess";
import { tryConsumeStaffHandoff } from "@/lib/staffHandoff";
import { decideAccess } from "@/lib/accessDecision";
import UnifiedLoginCard from "@/components/auth/UnifiedLoginCard";



/**
 * Guards staff-only routes: allows a signed-in admin, or anyone who enters the staff passcode.
 * With `adminOnly`, moderators are sent to their short quick-links page instead.
 */
const RequireAdmin = ({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) => {
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const check = async () => {
      let hasPasscode = hasStaffAccess() && Boolean(getStaffPasscode());
      const { data: { session } } = await supabase.auth.getSession();
      let isAdmin = false;
      let isModerator = false;
      if (session?.user) {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        const roles = (roleRows || []).map((r: { role: string }) => r.role);
        isModerator = roles.includes("moderator");
        isAdmin = roles.includes("admin");
        if (!isAdmin) {
          const { data } = await supabase.from("admin_users").select("id").eq("id", session.user.id).maybeSingle();
          isAdmin = Boolean(data);
        }
      }
      // A link opened from the team hub can carry a one-time token so the new tab inherits access.
      if (!isAdmin && !hasPasscode && !isModerator && (await tryConsumeStaffHandoff())) hasPasscode = true;

      const decision = decideAccess({ adminOnly, hasPasscode, signedIn: Boolean(session?.user), isAdmin, isModerator });
      if (!active) return;
      if (decision === "staff_hub") {
        navigate("/staff", { replace: true });
        return;
      }
      setStatus(decision === "allowed" ? "allowed" : "denied");
    };

    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, adminOnly]);

  if (status === "checking") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background" dir="rtl">
        <UnifiedLoginCard
          intendedPath={location.pathname}
          onPasscodeSuccess={() => setStatus("allowed")}
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAdmin;
