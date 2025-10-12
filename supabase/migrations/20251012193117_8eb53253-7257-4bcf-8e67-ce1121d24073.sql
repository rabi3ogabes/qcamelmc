-- Add id_number column to customers table
ALTER TABLE public.customers 
ADD COLUMN id_number TEXT;

-- Add id_number column to ticket_holders table
ALTER TABLE public.ticket_holders 
ADD COLUMN id_number TEXT;