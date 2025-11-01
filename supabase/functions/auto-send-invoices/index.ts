import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Order {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  qr_code: string | null;
  n8n_response_message: string | null;
  n8n_responded_at: string | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    country_code: string;
    nationality: string | null;
  };
  events?: {
    title: string;
    event_date: string;
    location: string;
  };
  ticket_holders?: Array<{
    qr_code: string | null;
    ticket_type: string;
  }>;
}

interface Settings {
  webhook_url: string | null;
  auto_invoice_interval_seconds: number;
  last_invoice_sent_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Auto-send invoices function triggered at:', new Date().toISOString());

    // Fetch settings including webhook URL, interval, and last sent time
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('webhook_url, auto_invoice_interval_seconds, last_invoice_sent_at')
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch settings' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const webhookUrl = (settings as Settings)?.webhook_url;
    if (!webhookUrl) {
      console.log('No webhook URL configured, skipping auto-send');
      return new Response(
        JSON.stringify({ message: 'No webhook URL configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Check if enough time has passed since last send
    const intervalSeconds = (settings as Settings)?.auto_invoice_interval_seconds || 60;
    const lastSentAt = (settings as Settings)?.last_invoice_sent_at;
    
    if (lastSentAt) {
      const lastSentTime = new Date(lastSentAt).getTime();
      const currentTime = Date.now();
      const timeSinceLastSend = (currentTime - lastSentTime) / 1000; // in seconds
      
      if (timeSinceLastSend < intervalSeconds) {
        console.log(`Interval not reached yet. ${Math.round(intervalSeconds - timeSinceLastSend)}s remaining`);
        return new Response(
          JSON.stringify({ 
            message: 'Interval not reached yet', 
            seconds_remaining: Math.round(intervalSeconds - timeSinceLastSend)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // Fetch orders that need to be sent (confirmed, sadad/cash_pos, not yet sent to n8n)
    const { data: orders, error: ordersError } = await supabaseClient
      .from('orders')
      .select(`
        *,
        customers(name, email, phone, country_code, nationality),
        events(title, event_date, location),
        ticket_holders(qr_code, ticket_type)
      `)
      .in('payment_method', ['sadad', 'cash_pos'])
      .eq('payment_status', 'confirmed')
      .is('n8n_response_message', null)
      .order('created_at', { ascending: true })
      .limit(1); // Only send one invoice at a time

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch orders' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!orders || orders.length === 0) {
      console.log('No orders to send');
      return new Response(
        JSON.stringify({ message: 'No orders to send' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const order = orders[0] as Order;
    console.log('Sending invoice for order:', order.booking_reference);

    // Construct webhook payload
    const countryCode = order.customers.country_code?.replace('+', '') || '974';
    const fullPhone = `${countryCode}${order.customers.phone}`;
    const ticketQrCodes = order.ticket_holders?.map(holder => holder.qr_code).filter(Boolean) || [];
    const ticketTypes = order.ticket_holders?.map(holder => holder.ticket_type) || [];

    const payload = {
      booking_reference: order.booking_reference,
      customer_name: order.customers.name,
      customer_phone: order.customers.phone,
      customer_phone_whatsapp: fullPhone,
      customer_email: order.customers.email,
      nationality: order.customers.nationality,
      ticket_type: order.ticket_type,
      quantity: order.quantity,
      total_amount: order.total_amount,
      payment_status: order.payment_status,
      qr_codes: ticketQrCodes,
      ticket_types: ticketTypes,
      event_title: order.events?.title,
      event_date: order.events?.event_date,
      event_location: order.events?.location,
      created_at: order.created_at,
    };

    // Send to webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await webhookResponse.json();
    console.log('Webhook response:', responseData);

    // Update last_invoice_sent_at timestamp in settings
    const { error: updateError } = await supabaseClient
      .from('settings')
      .update({ last_invoice_sent_at: new Date().toISOString() })
      .eq('id', (settings as any).id);

    if (updateError) {
      console.error('Error updating last_invoice_sent_at:', updateError);
    }

    // Return success/failure based on webhook response
    if (webhookResponse.ok && responseData.success !== false) {
      console.log('Invoice sent successfully for order:', order.booking_reference);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Invoice sent successfully',
          order_id: order.id,
          booking_reference: order.booking_reference,
          next_send_in_seconds: intervalSeconds
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } else {
      console.error('Failed to send invoice:', responseData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: responseData.message || 'Failed to send invoice',
          order_id: order.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

  } catch (error) {
    console.error('Error in auto-send-invoices function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
