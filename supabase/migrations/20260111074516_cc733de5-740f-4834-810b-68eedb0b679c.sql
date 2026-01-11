-- Add column to store payment error reason for failed orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_error_reason TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.orders.payment_error_reason IS 'Stores the error message/reason when a payment fails';