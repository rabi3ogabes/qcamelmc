import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = readFileSync('docs/n8n/prepare-whatsapp-callback.js', 'utf8');
const deliveryId = 'ab012345-1234-4567-89ab-0123456789ab';
const booking_reference = 'QTR-7-11-2026-9A657F69875B';
const success = { success: true, data: { key: { id: 'provider-message-1', fromMe: true }, status: 'PENDING' } };
function run(invoice: object, provider: object) {
  return runInNewContext(`(function() { ${script} })()`, {
    $: () => ({ first: () => ({ json: invoice }) }),
    $input: { first: () => ({ json: provider }) },
  }).json;
}
describe('n8n WhatsApp callback rules', () => {
  it('preserves the original Webhook delivery_id through the picker body', () => {
    expect(run({ body: { delivery_id: deliveryId, booking_reference } }, success))
      .toMatchObject({ delivery_id: deliveryId, booking_reference, status: 'success' });
  });
  it('preserves a top-level delivery_id', () => {
    expect(run({ delivery_id: deliveryId, booking_reference }, success).delivery_id).toBe(deliveryId);
  });
  it('does not register success for a provider failure', () => {
    expect(run({ delivery_id: deliveryId, booking_reference }, { ...success, success: false }).status).toBe('failed');
  });
  it('does not register success without an outgoing provider message ID', () => {
    expect(run({ delivery_id: deliveryId, booking_reference }, { success: true, data: {} }).status).toBe('failed');
  });
  it('does not accept webhook receipt as WhatsApp send confirmation', () => {
    expect(run({ delivery_id: deliveryId, booking_reference }, { success: true }).status).toBe('failed');
  });
});