-- Enable real-time updates for ticket_holders table
ALTER TABLE public.ticket_holders REPLICA IDENTITY FULL;

-- Add ticket_holders to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_holders;