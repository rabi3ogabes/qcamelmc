// Who may open a guarded page. Pure, so the rule is unit-tested.

export type AccessDecision = "allowed" | "login" | "staff_hub";

export interface AccessFacts {
  adminOnly: boolean;
  /** A valid team passcode is stored (or a staff handoff was consumed). */
  hasPasscode: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  isModerator: boolean;
}

export function decideAccess(f: AccessFacts): AccessDecision {
  if (f.signedIn && f.isAdmin) return "allowed";
  if (f.adminOnly) {
    // staff (moderator account or passcode) are sent to their own quick-links page
    if ((f.signedIn && f.isModerator) || f.hasPasscode) return "staff_hub";
    return "login";
  }
  if ((f.signedIn && f.isModerator) || f.hasPasscode) return "allowed";
  return "login";
}
