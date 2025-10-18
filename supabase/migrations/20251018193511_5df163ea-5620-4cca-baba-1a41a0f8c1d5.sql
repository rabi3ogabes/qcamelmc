-- Add country_code column to customers table
ALTER TABLE public.customers 
ADD COLUMN country_code text DEFAULT '+974';

-- Add country_code column to ticket_holders table
ALTER TABLE public.ticket_holders 
ADD COLUMN country_code text DEFAULT '+974';

-- Add comment to explain the columns
COMMENT ON COLUMN public.customers.country_code IS 'Phone country code (e.g., +974 for Qatar)';
COMMENT ON COLUMN public.ticket_holders.country_code IS 'Phone country code (e.g., +974 for Qatar)';