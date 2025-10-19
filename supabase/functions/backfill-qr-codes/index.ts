import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

    // Fetch all ticket holders that have text-based QR codes (not URLs)
    const { data: holders, error: fetchError } = await supabase
      .from('ticket_holders')
      .select('id, qr_code')
      .not('qr_code', 'is', null);

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${holders?.length || 0} ticket holders`);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const holder of holders || []) {
      // Skip if already has a URL (starts with http)
      if (holder.qr_code?.startsWith('http')) {
        skipped++;
        continue;
      }

      const qrText = holder.qr_code;
      console.log(`Generating QR for: ${qrText}`);

      try {
        // Generate QR code as data URL
        const qrDataUrl = await QRCode.toDataURL(qrText, {
          width: 800,
          margin: 2,
          errorCorrectionLevel: 'H',
          type: 'image/png'
        });

        // Convert data URL to buffer
        const base64Data = qrDataUrl.split(',')[1];
        const qrBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('qr-codes')
          .upload(`${qrText}.png`, qrBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) {
          console.error(`Upload error for ${qrText}:`, uploadError);
          errors.push(`${qrText}: ${uploadError.message}`);
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('qr-codes')
          .getPublicUrl(`${qrText}.png`);

        // Update ticket holder with the image URL
        const { error: updateError } = await supabase
          .from('ticket_holders')
          .update({ qr_code: publicUrl })
          .eq('id', holder.id);

        if (updateError) {
          console.error(`Update error for ${qrText}:`, updateError);
          errors.push(`${qrText}: ${updateError.message}`);
          continue;
        }

        updated++;
        console.log(`Successfully updated ${qrText}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error processing ${qrText}:`, error);
        errors.push(`${qrText}: ${errorMessage}`);
      }
    }

    console.log(`Completed: ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        success: true,
        updated,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully updated ${updated} QR codes, skipped ${skipped} existing URLs`
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
