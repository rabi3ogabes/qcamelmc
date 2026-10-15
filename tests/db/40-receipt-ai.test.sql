BEGIN;
DO $$
DECLARE i integer; lease uuid; result jsonb;
BEGIN
  FOR i IN 1..10 LOOP
    lease := gen_random_uuid();
    result := public.acquire_receipt_ai_slot('test:quota', lease);
    PERFORM t.ok((result->>'allowed')::boolean, 'reading within ten-request quota is allowed');
    PERFORM public.release_receipt_ai_slot('test:quota', lease);
  END LOOP;
  result := public.acquire_receipt_ai_slot('test:quota', gen_random_uuid());
  PERFORM t.eq(result->>'reason', 'quota', 'eleventh reading blocked');
  UPDATE public.receipt_ai_usage SET window_started_at = now() - interval '10 minutes 1 second' WHERE subject = 'test:quota';
  result := public.acquire_receipt_ai_slot('test:quota', gen_random_uuid());
  PERFORM t.ok((result->>'allowed')::boolean, 'quota resets after ten minutes');
  lease := gen_random_uuid();
  PERFORM public.acquire_receipt_ai_slot('test:busy', lease);
  result := public.acquire_receipt_ai_slot('test:busy', gen_random_uuid());
  PERFORM t.eq(result->>'reason', 'busy', 'concurrent reading blocked');
  PERFORM public.release_receipt_ai_slot('test:busy', gen_random_uuid());
  result := public.acquire_receipt_ai_slot('test:busy', gen_random_uuid());
  PERFORM t.eq(result->>'reason', 'busy', 'incorrect lease cannot unlock reading');
  PERFORM public.release_receipt_ai_slot('test:busy', lease);
  result := public.acquire_receipt_ai_slot('test:busy', gen_random_uuid());
  PERFORM t.ok((result->>'allowed')::boolean, 'correct lease unlocks reading');
  PERFORM t.ok(NOT has_function_privilege('authenticated', 'public.acquire_receipt_ai_slot(text, uuid)', 'EXECUTE'), 'browser cannot consume quota directly');
  PERFORM t.ok(NOT has_table_privilege('anon', 'public.receipt_ai_usage', 'SELECT'), 'anonymous users cannot read quota records');
END $$;
ROLLBACK;
