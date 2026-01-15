-- Add send_attempt_count column to orders table to track invoice send attempts
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS send_attempt_count integer DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN public.orders.send_attempt_count IS 'Number of times invoice sending was attempted. If >= 2 without success, invoice is put on hold.';