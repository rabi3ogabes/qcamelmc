import { describe, expect, it } from "vitest";
import { decideAccess } from "./accessDecision";

const none = { hasPasscode: false, signedIn: false, isAdmin: false, isModerator: false };

describe("page access", () => {
  it("a visitor who is not signed in gets the login screen", () => {
    expect(decideAccess({ ...none, adminOnly: false })).toBe("login");
    expect(decideAccess({ ...none, adminOnly: true })).toBe("login");
  });
  it("passcode staff can open staff pages", () => {
    expect(decideAccess({ ...none, hasPasscode: true, adminOnly: false })).toBe("allowed");
  });
  it("passcode staff cannot open admin-only pages", () => {
    expect(decideAccess({ ...none, hasPasscode: true, adminOnly: true })).toBe("staff_hub");
  });
  it("moderators cannot open admin-only pages", () => {
    expect(decideAccess({ ...none, signedIn: true, isModerator: true, adminOnly: true })).toBe("staff_hub");
  });
  it("admins can open everything", () => {
    expect(decideAccess({ ...none, signedIn: true, isAdmin: true, adminOnly: true })).toBe("allowed");
    expect(decideAccess({ ...none, signedIn: true, isAdmin: true, adminOnly: false })).toBe("allowed");
  });
  it("a signed-in account with no role gets the login screen", () => {
    expect(decideAccess({ ...none, signedIn: true, adminOnly: false })).toBe("login");
  });
});
