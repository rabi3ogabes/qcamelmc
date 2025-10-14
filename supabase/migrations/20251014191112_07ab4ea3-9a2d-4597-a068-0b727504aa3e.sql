-- Add setting to control delete customer button visibility
ALTER TABLE settings
ADD COLUMN show_delete_customer_button boolean DEFAULT false;