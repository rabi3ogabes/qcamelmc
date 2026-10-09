// Admin authentication for edge functions. The public anon key is NOT a user
// token, so it can never pass as an admin; the check is always made against
// the verified user id and the admin_users table.

import { HttpError } from "./http.ts";

export interface AuthDeps {
  /** Resolve a user JWT to a user id, or null if it is not a valid user session. */
  getUserId(jwt: string): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
}

export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

async function userIdOf(req: Request, deps: AuthDeps): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    return await deps.getUserId(token);
  } catch {
    return null;
  }
}

/** Returns the admin's user id or throws 401 (not signed in) / 403 (not an admin). */
export async function requireAdmin(req: Request, deps: AuthDeps): Promise<string> {
  const userId = await userIdOf(req, deps);
  if (!userId) throw new HttpError(401, "unauthorized", "Sign in as an administrator");
  if (!(await deps.isAdmin(userId))) throw new HttpError(403, "forbidden", "Administrators only");
  return userId;
}

/** Admin id if the caller is an admin, otherwise null (never throws). */
export async function optionalAdmin(req: Request, deps: AuthDeps): Promise<string | null> {
  const userId = await userIdOf(req, deps);
  if (!userId) return null;
  try {
    return (await deps.isAdmin(userId)) ? userId : null;
  } catch {
    return null;
  }
}
