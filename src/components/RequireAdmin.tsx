import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAdminSession, type AdminClient } from "@/hooks/useAdminSession";

/**
 * Route guard for every administrator screen. Nothing inside is rendered (or
 * even mounted, so no data is requested) until the database confirms the
 * signed-in user is an admin. Data is additionally protected by row-level
 * security: this guard is about not showing admin UI to the wrong people.
 */
export function RequireAdmin({ children, client }: { children: ReactNode; client?: AdminClient }) {
  const session = useAdminSession(client);
  const location = useLocation();

  if (session.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="loading">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (session.status !== "admin") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname, reason: session.status }} />;
  }

  return <>{children}</>;
}
