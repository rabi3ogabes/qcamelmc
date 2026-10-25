# WhatsApp invoice workflow

The existing production webhook remains the destination. Manual invoice sends now include all existing invoice fields plus:

- `whatsapp_message` and `message`: the rendered, randomly chosen enabled Settings template (null when no enabled template exists, preserving the workflow's existing default).
- `template_id`, `template_name`: selected template metadata.
- `invoice_url`: customer invoice link.
- `delivery_id`: opaque UUID identifying this individual attempt. Keep it private within the workflow.
- `channel: "whatsapp"`, `action: "send_invoice"`.

Configure the WhatsApp node to use `whatsapp_message` when present, otherwise its existing message. Do not mark delivery successful merely because the webhook received the request.

After the WhatsApp provider confirms sending, POST to the existing `n8n-response` function:

```json
{
  "booking_reference": "the original booking_reference",
  "delivery_id": "the original delivery_id",
  "status": "success",
  "message": "تم إرسال الفاتورة عبر واتساب"
}
```

On provider failure use `status: "failed"` and a bounded failure message. Forward the existing `x-webhook-secret` if the deployment has configured `N8N_RESPONSE_SECRET`. The opaque attempt ID additionally scopes tracked callbacks to one known delivery. Duplicate callbacks do not increment counts. Reference-only legacy callbacks continue for old untracked bookings, but cannot confirm tracked attempts.

Each manual resend creates a new attempt and chooses a template again; its history never replaces earlier deliveries. Email remains on the built-in branded email sender, independently counted. Historic email duplicate log rows with the same attempt are counted once. Historic WhatsApp response text remains visible, without inventing counts.

Archived bookings are available through exact-reference administrator search only and remain excluded from automated sending.

External workflow configuration and an actual customer WhatsApp delivery have not been verified: no accessible n8n connection was available during implementation.