-- Add default tickets for events that don't have tickets configured yet
DO $$
DECLARE
    event_record RECORD;
    ticket_count INTEGER;
BEGIN
    -- Loop through all events
    FOR event_record IN SELECT id FROM public.events
    LOOP
        -- Check if event has any tickets
        SELECT COUNT(*) INTO ticket_count
        FROM public.tickets
        WHERE event_id = event_record.id;
        
        -- If no tickets exist, create default ones
        IF ticket_count = 0 THEN
            INSERT INTO public.tickets (event_id, type, price, available_quantity, sold_quantity)
            VALUES 
                (event_record.id, 'vip', 200, 100, 0),
                (event_record.id, 'normal', 150, 500, 0),
                (event_record.id, 'parking', 1, 200, 0);
        END IF;
    END LOOP;
END $$;