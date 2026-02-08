import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== Send to Webhook Function Started ===');

    // Get the ticket data from request body first to determine action
    const ticketData = await req.json();
    const isEmailAction = ticketData.action === 'send_email';

    // Get webhook URL from settings
    const webhookColumn = isEmailAction ? 'email_webhook_url' : 'webhook_url';
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('webhook_url, email_webhook_url')
      .single();

    if (settingsError) {
      console.error('Error fetching webhook URL from settings:', settingsError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch webhook settings',
          details: settingsError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const webhookUrl = isEmailAction 
      ? (settings?.email_webhook_url || settings?.webhook_url)
      : settings?.webhook_url;

    if (!webhookUrl) {
      const missingType = isEmailAction ? 'Email webhook' : 'Webhook';
      console.error(`${missingType} URL is not configured in settings`);
      return new Response(
        JSON.stringify({ 
          error: `${missingType} URL not configured`,
          hint: isEmailAction 
            ? 'Please configure the email webhook URL in admin settings'
            : 'Please configure the webhook URL in admin settings'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Using ${isEmailAction ? 'email' : 'whatsapp'} webhook URL:`, webhookUrl);

    // Check if it's a test webhook
    if (webhookUrl.includes('webhook-test')) {
      console.warn('⚠️ WARNING: Using test webhook URL. For production, use a production webhook (workflow must be ACTIVATED in n8n)');
    }

    // Extract order ID if present for marking as sent
    
    // Extract order ID if present for marking as sent
    const orderId = ticketData.order_id;
    
    // Format phone numbers for webhook (country_code + phone without + and leading 0)
    const formatPhoneForWebhook = (countryCode: string, phone: string) => {
      const cleanCode = countryCode.replace('+', '').trim();
      let cleanPhone = phone.replace(/[\s+]/g, '').trim();
      // Remove leading 0 if present
      if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
      }
      return `${cleanCode}${cleanPhone}`;
    };
    
    // Format customer phone
    if (ticketData.customers?.country_code && ticketData.customers?.phone) {
      ticketData.customers.phone = formatPhoneForWebhook(
        ticketData.customers.country_code, 
        ticketData.customers.phone
      );
    }
    
    // Format ticket holder phones
    if (ticketData.ticket_holders && Array.isArray(ticketData.ticket_holders)) {
      ticketData.ticket_holders = ticketData.ticket_holders.map((holder: any) => ({
        ...holder,
        phone: holder.country_code && holder.phone 
          ? formatPhoneForWebhook(holder.country_code, holder.phone)
          : holder.phone
      }));
    }
    
    // Format holder phone if present
    if (ticketData.holder?.country_code && ticketData.holder?.phone) {
      ticketData.holder.phone = formatPhoneForWebhook(
        ticketData.holder.country_code,
        ticketData.holder.phone
      );
    }
    
    console.log('=== Ticket Data to Send ===');
    console.log('Booking Reference:', ticketData.booking_reference);
    console.log('Event Location:', ticketData.event_location);
    console.log('Event Date:', ticketData.event_date);
    console.log('Event Title:', ticketData.event_title);
    console.log('Ticket Count:', ticketData.ticket_count);
    console.log('Customer Name:', ticketData.customers?.name);
    console.log('Payment Status:', ticketData.payment_status);
    console.log('Action:', ticketData.action);
    console.log('Number of Ticket Holders:', ticketData.ticket_holders?.length);
    console.log('Holder Info:', ticketData.holder ? {
      name: ticketData.holder.name,
      phone: ticketData.holder.phone,
      ticket_type: ticketData.holder.ticket_type
    } : 'No holder data');
    console.log('Full payload:', JSON.stringify(ticketData, null, 2));

    // Forward the request to n8n webhook with timeout
    console.log('Sending POST request to webhook...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ticketData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('Webhook response status:', webhookResponse.status);
      console.log('Webhook response headers:', Object.fromEntries(webhookResponse.headers));

      const responseText = await webhookResponse.text();
      console.log('Webhook response body:', responseText);

      if (!webhookResponse.ok) {
        console.error('❌ Webhook returned error status:', webhookResponse.status);
        
        // Parse error details if possible
        let errorDetails;
        try {
          errorDetails = JSON.parse(responseText);
        } catch {
          errorDetails = responseText;
        }

        // Check for specific n8n errors
        if (webhookResponse.status === 404) {
          console.error('❌ 404 Error: Webhook not found or not active');
          console.error('This usually means:');
          console.error('1. The workflow in n8n is not ACTIVATED (just executed in test mode)');
          console.error('2. The webhook URL is incorrect');
          console.error('3. For test webhooks: You need to click "Execute Workflow" in n8n before each call');
          console.error('');
          console.error('SOLUTION: In n8n, ACTIVATE the workflow (toggle at top) instead of just testing it');
          
          return new Response(
            JSON.stringify({ 
              error: 'Webhook not found or inactive',
              details: errorDetails,
              status: 404,
              solution: 'Please ACTIVATE the workflow in n8n (not just test mode). Click the toggle at the top of the workflow to activate it permanently.'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: 'Webhook returned error', 
            details: errorDetails,
            status: webhookResponse.status
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Webhook call successful');

      // Mark order as "sending" - waiting for n8n to process and respond back via n8n-response endpoint
      // Do NOT set final message here - let n8n-response handle that
      const pendingMessage = isEmailAction ? 'جاري إرسال البريد الإلكتروني...' : 'جاري الإرسال إلى واتساب...';
      
      if (orderId) {
        console.log('Marking order as pending (waiting for n8n response):', orderId);
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            n8n_response_message: pendingMessage,
            n8n_responded_at: null // Keep null until n8n actually responds
          })
          .eq('id', orderId);
        
        if (updateError) {
          console.error('Error updating order status:', updateError);
        } else {
          console.log('Order marked as pending successfully');
        }
      } else if (ticketData.booking_reference) {
        // Fallback: try to find order by booking reference
        console.log('Marking order as pending by booking_reference:', ticketData.booking_reference);
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            n8n_response_message: pendingMessage,
            n8n_responded_at: null // Keep null until n8n actually responds
          })
          .eq('booking_reference', ticketData.booking_reference);
        
        if (updateError) {
          console.error('Error updating order status by booking_reference:', updateError);
        } else {
          console.log('Order marked as pending successfully by booking_reference');
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: pendingMessage,
          response: responseText 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('❌ Webhook request timed out after 10 seconds');
        return new Response(
          JSON.stringify({ 
            error: 'Webhook request timed out',
            details: 'The webhook did not respond within 10 seconds'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw fetchError;
    }

  } catch (error) {
    console.error('❌ Error in send-to-webhook function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
