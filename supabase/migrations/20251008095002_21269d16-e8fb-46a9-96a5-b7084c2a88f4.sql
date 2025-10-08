-- Add is_present column to orders table for attendance tracking
ALTER TABLE orders 
ADD COLUMN is_present BOOLEAN DEFAULT NULL;

-- Add index for faster queries
CREATE INDEX idx_orders_is_present ON orders(is_present);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;