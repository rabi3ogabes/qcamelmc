REVOKE EXECUTE ON FUNCTION public.validate_order_amount() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_ticket_capacity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_ticket_limit() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_ticket_sold_quantity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_visitors() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_booking_reference() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_ticket_holder_reference() FROM anon, authenticated, public;