-- Add index on ticket_holders.qr_code for fast check-in lookups
CREATE INDEX IF NOT EXISTS idx_ticket_holders_qr_code ON public.ticket_holders (qr_code);

-- Also add index on orders.booking_reference for legacy check-in path
CREATE INDEX IF NOT EXISTS idx_orders_booking_reference ON public.orders (booking_reference);