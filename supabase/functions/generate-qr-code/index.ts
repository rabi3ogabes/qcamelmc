import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, filename, holderId } = await req.json();
    
    if (!text || !filename) {
      return new Response(
        JSON.stringify({ error: 'Missing text or filename' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate QR code using API
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(text)}&format=png`;
    
    const qrResponse = await fetch(qrApiUrl);
    
    if (!qrResponse.ok) {
      return new Response(
        JSON.stringify({ error: `QR API returned ${qrResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const qrBuffer = new Uint8Array(await qrResponse.arrayBuffer());

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(`${filename}.png`, qrBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('qr-codes')
      .getPublicUrl(`${filename}.png`);

    // Persist the QR image URL on the ticket holder (clients cannot update this table)
    if (holderId) {
      const { error: updateError } = await supabase
        .from('ticket_holders')
        .update({ qr_code: publicUrl })
        .eq('id', holderId);
      if (updateError) console.error('Holder QR update error:', updateError);
    }

    return new Response(
      JSON.stringify({ url: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );


  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
