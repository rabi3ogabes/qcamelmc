CREATE TABLE public.staff_handoff_tokens (
  token text PRIMARY KEY,
  passcode text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.staff_handoff_tokens TO service_role;
ALTER TABLE public.staff_handoff_tokens ENABLE ROW LEVEL SECURITY;