-- Add column to store n8n response message in orders table
ALTER TABLE public.orders 
ADD COLUMN n8n_response_message text;

-- Add column to store when n8n responded
ALTER TABLE public.orders 
ADD COLUMN n8n_responded_at timestamp with time zone;