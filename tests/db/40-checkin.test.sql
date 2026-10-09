-- Gate scanning: exactly one entry per paid ticket.
BEGIN;
SELECT t.seed();
SET LOCAL ROLE service_role;

CREATE TEMP TABLE paid AS
SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":2}'),
                           t.holders('{"a2000000-0000-4000-8000-000000000001":2}'), 'sadad') AS j;
SELECT public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM paid), 'SD-CHK');

CREATE TEMP TABLE unpaid AS
SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1}'),
                           t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'sadad') AS j;

CREATE TEMP TABLE c1 AS
SELECT public.check_in_ticket((SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM paid),
                              '00000000-0000-4000-8000-0000000000a1') AS j;
SELECT t.eq(j ->> 'result', 'checked_in', 'a paid ticket is admitted') FROM c1;
SELECT t.eq(j -> 'ticket' ->> 'holder_name', 'Holder 1', 'response names the holder') FROM c1;
SELECT t.ok(j -> 'ticket' ? 'holder_id_number' AND j -> 'ticket' ? 'event_title' AND j -> 'ticket' ? 'customer_name',
            'response carries what the gate staff need') FROM c1;
SELECT t.ok((SELECT is_present AND confirmed_at IS NOT NULL AND confirmed_by = '00000000-0000-4000-8000-0000000000a1'
               FROM public.ticket_holders WHERE qr_code = (SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM paid)),
            'holder is marked present by that admin');

SELECT t.eq(public.check_in_ticket((SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM paid), '00000000-0000-4000-8000-0000000000a1') ->> 'result',
            'already_present', 'the same ticket cannot enter twice');
SELECT t.ok(public.check_in_ticket((SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM paid), NULL) -> 'ticket' ? 'confirmed_at',
            'the repeat scan shows when it was first used');

SELECT t.eq(public.check_in_ticket((SELECT j -> 'holders' -> 1 ->> 'qr_code' FROM paid), NULL) ->> 'result', 'checked_in',
            'the second ticket of the same order is independent');

SELECT t.eq(public.check_in_ticket((SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM unpaid), NULL) ->> 'result',
            'payment_not_confirmed', 'an unpaid ticket is refused');
SELECT t.ok((SELECT NOT is_present FROM public.ticket_holders WHERE qr_code = (SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM unpaid)),
            'and stays un-used');

SELECT t.eq(public.check_in_ticket('QTR-NOT-A-REAL-CODE-TKT01', NULL) ->> 'result', 'not_found', 'unknown code');
SELECT t.eq(public.check_in_ticket('', NULL) ->> 'result', 'not_found', 'empty code');

-- QR images generated before this change encode the code; scanning an image URL still works
UPDATE public.ticket_holders SET qr_image_url = 'https://x.supabase.co/storage/v1/object/public/qr-codes/img.png'
 WHERE qr_code = (SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM unpaid);
SELECT public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM unpaid), 'SD-CHK2');
SELECT t.eq(public.check_in_ticket('https://x.supabase.co/storage/v1/object/public/qr-codes/img.png', NULL) ->> 'result',
            'checked_in', 'a code that is the stored image URL also matches');

-- cancelled orders do not admit
CREATE TEMP TABLE cx AS
SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1}'),
                           t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'cash_pos', 'pos',
                           '00000000-0000-4000-8000-0000000000a1') AS j;
UPDATE public.orders SET payment_status = 'cancelled' WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM cx);
SELECT t.eq(public.check_in_ticket((SELECT j -> 'holders' -> 0 ->> 'qr_code' FROM cx), NULL) ->> 'result',
            'payment_not_confirmed', 'a cancelled ticket is refused');

RESET ROLE;
ROLLBACK;
