-- The admin UI and the payment-expiry logic both use a "failed" order state,
-- but the enum only ever contained pending / confirmed / cancelled, so any
-- write of 'failed' errored. Kept in its own migration because a new enum
-- value cannot be used in the transaction that adds it.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'failed';
