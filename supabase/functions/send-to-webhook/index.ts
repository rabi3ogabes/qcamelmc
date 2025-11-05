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

    // Get webhook URL from settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('webhook_url')
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

    if (!settings?.webhook_url) {
      console.error('Webhook URL is not configured in settings');
      return new Response(
        JSON.stringify({ 
          error: 'Webhook URL not configured',
          hint: 'Please configure the webhook URL in admin settings'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const webhookUrl = settings.webhook_url;
    console.log('Webhook URL from settings:', webhookUrl);

    // Check if it's a test webhook
    if (webhookUrl.includes('webhook-test')) {
      console.warn('⚠️ WARNING: Using test webhook URL. For production, use a production webhook (workflow must be ACTIVATED in n8n)');
    }

    // Get the ticket data from request body
    const ticketData = await req.json();
    
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

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Data sent to webhook successfully',
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
