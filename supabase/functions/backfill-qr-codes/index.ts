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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch only ticket holders with text-based QR codes (not URLs)
    const { data: holders, error: fetchError } = await supabase
      .from('ticket_holders')
      .select('id, qr_code')
      .not('qr_code', 'is', null)
      .not('qr_code', 'like', 'http%')
      .limit(50); // Process max 50 at a time to avoid timeout

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${holders?.length || 0} ticket holders needing QR generation`);

    if (!holders?.length) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, skipped: 0, message: 'No QR codes to generate' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let updated = 0;
    const errors: string[] = [];

    // Process in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < holders.length; i += BATCH_SIZE) {
      const batch = holders.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(async (holder) => {
          const qrText = holder.qr_code!;
          const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(qrText)}&format=png`;
          
          const qrResponse = await fetch(qrApiUrl);
          if (!qrResponse.ok) throw new Error(`QR API returned ${qrResponse.status}`);
          
          const qrBuffer = new Uint8Array(await qrResponse.arrayBuffer());

          const { error: uploadError } = await supabase.storage
            .from('qr-codes')
            .upload(`${qrText}.png`, qrBuffer, { contentType: 'image/png', upsert: true });

          if (uploadError) throw new Error(uploadError.message);

          const { data: { publicUrl } } = supabase.storage
            .from('qr-codes')
            .getPublicUrl(`${qrText}.png`);

          const { error: updateError } = await supabase
            .from('ticket_holders')
            .update({ qr_code: publicUrl })
            .eq('id', holder.id);

          if (updateError) throw new Error(updateError.message);
          return qrText;
        })
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          updated++;
        } else {
          const qrText = batch[idx].qr_code || 'unknown';
          errors.push(`${qrText}: ${result.reason}`);
          console.error(`Error processing ${qrText}:`, result.reason);
        }
      });
    }

    console.log(`Completed: ${updated} updated, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        success: true,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully updated ${updated} QR codes`
      }),
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
