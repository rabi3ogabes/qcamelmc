import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface N8nResponsePayload {
  booking_reference: string;
  message: string;
  status?: 'success' | 'failed';
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse the request body
    const payload: N8nResponsePayload = await req.json();
    
    console.log('Received n8n response:', payload);

    // Validate required fields
    if (!payload.booking_reference || !payload.message) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: booking_reference and message' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Update the order with n8n response
    const { data, error } = await supabase
      .from('orders')
      .update({
        n8n_response_message: payload.message,
        n8n_responded_at: new Date().toISOString(),
      })
      .eq('booking_reference', payload.booking_reference)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update order',
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Order not found with booking reference: ' + payload.booking_reference 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Successfully updated order:', data.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Order updated successfully',
        order_id: data.id,
        booking_reference: data.booking_reference
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error processing n8n response:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
