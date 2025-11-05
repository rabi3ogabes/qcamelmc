
-- Function to update ticket sold_quantity based on confirmed ticket_holders
CREATE OR REPLACE FUNCTION public.update_ticket_sold_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_ticket_type text;
  v_ticket_id uuid;
  v_sold_count integer;
BEGIN
  -- Determine the event_id and ticket_type based on the trigger context
  IF TG_TABLE_NAME = 'ticket_holders' THEN
    -- Get event_id from the order
    SELECT o.event_id, COALESCE(NEW.ticket_type, OLD.ticket_type)
    INTO v_event_id, v_ticket_type
    FROM orders o
    WHERE o.id = COALESCE(NEW.order_id, OLD.order_id);
  ELSIF TG_TABLE_NAME = 'orders' THEN
    -- Get event_id and ticket_type from the order itself
    v_event_id := NEW.event_id;
    v_ticket_type := NEW.ticket_type::text;
  END IF;

  -- Find the ticket_id for this event and type
  SELECT id INTO v_ticket_id
  FROM tickets
  WHERE event_id = v_event_id 
    AND type::text = v_ticket_type;

  -- If no ticket found, exit
  IF v_ticket_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count confirmed ticket_holders for this ticket
  SELECT COUNT(DISTINCT th.id) INTO v_sold_count
  FROM ticket_holders th
  JOIN orders o ON th.order_id = o.id
  WHERE o.event_id = v_event_id
    AND th.ticket_type = v_ticket_type
    AND o.payment_status = 'confirmed';

  -- Update the tickets table
  UPDATE tickets
  SET sold_quantity = v_sold_count
  WHERE id = v_ticket_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on ticket_holders table (INSERT, DELETE)
DROP TRIGGER IF EXISTS trigger_update_ticket_sold_on_holder_change ON ticket_holders;
CREATE TRIGGER trigger_update_ticket_sold_on_holder_change
AFTER INSERT OR DELETE ON ticket_holders
FOR EACH ROW
EXECUTE FUNCTION update_ticket_sold_quantity();

-- Trigger on orders table (UPDATE when payment_status changes)
DROP TRIGGER IF EXISTS trigger_update_ticket_sold_on_order_confirm ON orders;
CREATE TRIGGER trigger_update_ticket_sold_on_order_confirm
AFTER UPDATE OF payment_status ON orders
FOR EACH ROW
WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
EXECUTE FUNCTION update_ticket_sold_quantity();

-- Trigger on orders table (DELETE)
DROP TRIGGER IF EXISTS trigger_update_ticket_sold_on_order_delete ON orders;
CREATE TRIGGER trigger_update_ticket_sold_on_order_delete
AFTER DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_ticket_sold_quantity();
