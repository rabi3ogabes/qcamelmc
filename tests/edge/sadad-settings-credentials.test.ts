import { describe, expect, it } from "vitest";
import { sadadCredentialsFromSettings } from "../../supabase/functions/_shared/settings.ts";
import { configuredSettings } from "./helpers.ts";

describe("Sadad uses admin settings exclusively", () => {
  it("uses the saved merchant, checkout secret and domain, not the support API key", () => {
    const settings = configuredSettings({ merchantId: " 123 ", secret: " saved-test-secret ", apiKey: "different-test-pin", websiteDomain: " merchant.example " });
    expect(sadadCredentialsFromSettings(settings)).toEqual({ sadadId: "123", secretKey: "saved-test-secret", domain: "merchant.example" });
  });

  it.each(["merchantId", "secret", "websiteDomain"] as const)("refuses missing %s instead of using a fallback", (field) => {
    expect(sadadCredentialsFromSettings(configuredSettings())).not.toBeNull();
    expect(sadadCredentialsFromSettings(configuredSettings({ [field]: null }))).toBeNull();
    expect(sadadCredentialsFromSettings(configuredSettings({ [field]: " " }))).toBeNull();
  });
});