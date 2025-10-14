-- Set default value for is_present to false (absent by default)
ALTER TABLE public.orders 
ALTER COLUMN is_present SET DEFAULT false;

-- Update existing null values to false
UPDATE public.orders 
SET is_present = false 
WHERE is_present IS NULL;

-- Do the same for ticket_holders table
ALTER TABLE public.ticket_holders 
ALTER COLUMN is_present SET DEFAULT false;

UPDATE public.ticket_holders 
SET is_present = false 
WHERE is_present IS NULL;