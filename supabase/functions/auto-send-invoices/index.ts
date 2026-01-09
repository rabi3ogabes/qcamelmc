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
  invoice_batch_min: number;
  invoice_batch_max: number;
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
      .select('id, webhook_url, auto_invoice_interval_seconds, last_invoice_sent_at, invoice_batch_min, invoice_batch_max')
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
    const batchMin = (settings as Settings)?.invoice_batch_min || 1;
    const batchMax = (settings as Settings)?.invoice_batch_max || 10;
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

    // Fetch orders that need to be sent (confirmed, sadad only, not yet sent to n8n)
    const { data: allOrders, error: ordersError } = await supabaseClient
      .from('orders')
      .select(`
        *,
        customers(name, email, phone, country_code, nationality),
        events(title, event_date, location),
        ticket_holders(qr_code, ticket_type)
      `)
      .eq('payment_method', 'sadad')
      .eq('payment_status', 'confirmed')
      .is('n8n_response_message', null)
      .order('created_at', { ascending: true })
      .limit(batchMax * 2); // Fetch more to account for filtering

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch orders' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Filter out orders from November 6, 7, 8, 2025
    const orders = (allOrders || []).filter(order => {
      const orderDate = new Date(order.created_at);
      const year = orderDate.getFullYear();
      const month = orderDate.getMonth(); // 0-indexed (10 = November)
      const day = orderDate.getDate();
      
      // Exclude November 6, 7, 8, 2025
      if (year === 2025 && month === 10) {
        if (day === 6 || day === 7 || day === 8) {
          return false;
        }
      }
      return true;
    }).slice(0, batchMax); // Apply the original batch limit after filtering

    if (!orders || orders.length === 0) {
      console.log('No orders to send after filtering');
      return new Response(
        JSON.stringify({ message: 'No orders to send' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Determine actual batch size (between min and max)
    const batchSize = Math.min(batchMax, Math.max(batchMin, orders.length));
    const ordersToSend = orders.slice(0, batchSize);
    
    console.log(`Sending ${ordersToSend.length} invoices (batch range: ${batchMin}-${batchMax})`);

    // Calculate total quantity across all orders being sent
    const totalQuantity = ordersToSend.reduce((sum, order) => sum + (order as Order).quantity, 0);

    // Send all invoices in the batch
    const results = [];
    for (const order of ordersToSend) {
      const typedOrder = order as Order;
      console.log('Sending invoice for order:', typedOrder.booking_reference);

      // Construct webhook payload
      const countryCode = typedOrder.customers.country_code?.replace('+', '') || '974';
      const fullPhone = `${countryCode}${typedOrder.customers.phone}`;
      
      // Convert QR codes to full URLs if they're not already
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const ticketQrCodes = typedOrder.ticket_holders?.map(holder => {
        if (!holder.qr_code) return null;
        // If it's already a full URL, return it as is
        if (holder.qr_code.startsWith('http')) {
          return holder.qr_code;
        }
        // Otherwise, construct the full URL
        return `${supabaseUrl}/storage/v1/object/public/qr-codes/${holder.qr_code}.png`;
      }).filter(Boolean) || [];
      const ticketTypes = typedOrder.ticket_holders?.map(holder => holder.ticket_type) || [];

      const payload = {
        booking_reference: typedOrder.booking_reference,
        customer_name: typedOrder.customers.name,
        customer_phone: typedOrder.customers.phone,
        customer_phone_whatsapp: fullPhone,
        customer_email: typedOrder.customers.email,
        nationality: typedOrder.customers.nationality,
        ticket_type: typedOrder.ticket_type,
        quantity: typedOrder.quantity,
        total_quantity: totalQuantity,
        total_amount: typedOrder.total_amount,
        payment_status: typedOrder.payment_status,
        qr_codes: ticketQrCodes,
        ticket_types: ticketTypes,
        event_title: typedOrder.events?.title,
        event_date: typedOrder.events?.event_date,
        event_location: typedOrder.events?.location,
        created_at: typedOrder.created_at,
      };

      // Send to webhook
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let responseData: any = {};
      try {
        responseData = await webhookResponse.json();
      } catch (e) {
        responseData = { message: 'No JSON response' };
      }
      
      console.log('Webhook response for', typedOrder.booking_reference, ':', responseData);
      
      const isSuccess = webhookResponse.ok && responseData.success !== false;
      
      // Immediately mark order as sent to prevent duplicate sends
      if (isSuccess) {
        const { error: markSentError } = await supabaseClient
          .from('orders')
          .update({
            n8n_response_message: responseData.message || 'تم الإرسال تلقائياً',
            n8n_responded_at: new Date().toISOString()
          })
          .eq('id', typedOrder.id);
        
        if (markSentError) {
          console.error('Error marking order as sent:', markSentError);
        } else {
          console.log('Order marked as sent:', typedOrder.booking_reference);
        }
      }
      
      results.push({
        order_id: typedOrder.id,
        booking_reference: typedOrder.booking_reference,
        success: isSuccess
      });
    }

    // Update last_invoice_sent_at timestamp in settings
    const { error: updateError } = await supabaseClient
      .from('settings')
      .update({ last_invoice_sent_at: new Date().toISOString() })
      .eq('id', (settings as any).id);

    if (updateError) {
      console.error('Error updating last_invoice_sent_at:', updateError);
    }

    // Return success/failure based on results
    const successCount = results.filter(r => r.success).length;
    console.log(`Invoice batch completed: ${successCount}/${results.length} sent successfully`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${successCount}/${results.length} invoices successfully`,
        batch_size: results.length,
        total_quantity: totalQuantity,
        results: results,
        next_send_in_seconds: intervalSeconds
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in auto-send-invoices function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
