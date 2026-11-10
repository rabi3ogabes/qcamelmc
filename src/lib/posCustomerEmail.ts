import { normalizeCustomerEmail } from "../../supabase/functions/_shared/customer-email";

/** POS email is optional; malformed legacy data must not block a cash sale. */
export const posCustomerEmail = (value: unknown): string => normalizeCustomerEmail(value) ?? "";
