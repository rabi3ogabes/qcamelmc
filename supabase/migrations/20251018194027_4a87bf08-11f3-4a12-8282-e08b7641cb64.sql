-- Update existing ticket_holders to have country_code
UPDATE public.ticket_holders 
SET country_code = '+974' 
WHERE country_code IS NULL;

-- Update existing customers to have country_code
UPDATE public.customers 
SET country_code = '+974' 
WHERE country_code IS NULL;