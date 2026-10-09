# Deployment runbook

This release changes how orders, payments and staff access work. Everything below is verified by automated
tests against a replay of **all 114 existing migrations plus the two new ones** (see [Testing](#testing)),
**but not against your live Supabase project or the live Sadad gateway**. That is what the checklist in
step 6 is for. Follow the steps in order: the new site and functions must be live **before** the second
migration, because the old site books through functions that migration closes.

## What this release fixes (and why it matters)

| Problem on `main` | Fix |
|---|---|
| Anyone with the public key could call `create_pos_booking` and receive **confirmed tickets without paying** (also: insert an order that is already `confirmed`). | Orders exist only through `create_order`, called by the `create-order` function with the service role. The open function and the open INSERT policies are removed. |
| `sadad-webhook` confirmed an order from an **unsigned** message that carried a transaction number and the right amount; even a signed message never checked the amount; `sadad-payment` charged whatever amount the browser sent. | The amount and the "paid" decision come only from Sadad's own API (`payment-decision.ts`); callback and webhook are triggers. The charge is built on the server from database prices. |
| A staff passcode with a **default value written in the source code**, the same text as the password on the login page, guarded check-in, order moves and customer lookup. Two hidden buttons on the login page signed in with it. | No default: the passcode comes only from the `STAFF_PASSCODE` secret, is refused if unset / short / the old value, is compared in constant time and is throttled on the server. The two buttons are gone. |
| `create_public_booking` / `get_public_order` leaked holders' national IDs by order reference. | The public order lookup no longer returns ID numbers (administrators still get them). |
| Stock counters ignored unpaid online orders and drifted; "return ticket" **added to capacity**. | One rule in the database: `sold_quantity` = seats held by pending/confirmed orders. Cancel / expire / move / restore keep it right. |
| Abandoned online checkouts stayed `pending` forever. | A pending online order holds its seats for 30 minutes, then closes as `cancelled` with the note `expired`. |
| Many functions (`send-to-webhook`, `notify-admin-sale`, `send-invoice-email`, `parse-pos-receipt`, `checkout-webhook`, ...) could be called by anyone. | Authenticated: administrators, staff or the service role as appropriate; `checkout-webhook` is removed. |

## 0. Do these now (independent of the code)

1. **Change the admin password** of the account whose login was written on the login page. It has been
   readable by every visitor of the website. If it is used anywhere else, change it there too.
2. **Set a new team passcode**: Supabase → Edge Functions → Secrets → `STAFF_PASSCODE` (at least 8 characters,
   not the old one). Until you do, passcode login is **switched off** (only real accounts work), on purpose.
   Tell the gate team the new passcode.
3. Supabase → Authentication: review users and sign-in logs for unexpected logins; disable public sign-ups.
4. **Rotate the Sadad secret key** in the Sadad merchant panel and **replace the n8n webhook URL**
   (create a new webhook path in n8n). Enter the new values in step 4, not before.
5. Optional but recommended: set a secret `N8N_RESPONSE_SECRET` and make your n8n "report back" node send it
   as the `x-webhook-secret` header. Until it is set, `n8n-response` keeps accepting calls as before.

## 1. Apply the first migration (safe while the old site is live)

Run `supabase/migrations/20261009100100_orders_payments_additive.sql` (Lovable's database tool or the Supabase
SQL editor). It:

- adds the columns and the audit table the new flow needs (`payment_events`, `orders.payment_expires_at`, ...);
- **closes every online order that is still `pending` and older than 30 minutes** (marks it `cancelled`,
  note `expired`). Until now nothing ever closed them, and they would otherwise block sales now that pending
  orders hold seats. A customer who really paid can still be rescued with **«تحقق من سداد»** (step 7);
- replaces the old stock counters with the new triggers and recounts every ticket type once;
- keeps the existing per-person limit (5 normal + VIP per event) and the price checks.

Run each migration once.

## 2. Deploy the edge functions

Deploy everything under `supabase/functions/` (Lovable does this on sync; with the CLI `supabase functions deploy`).

- **New:** `create-order`, `sadad-callback`, `verify-payment`, `sadad-diagnose`
- **Rewritten:** `sadad-payment` (re-opens payment for a pending order), `sadad-webhook`, `send-to-webhook`
  (administrators only), `generate-qr-code`, `backfill-qr-codes`, `regenerate-booking-qr-codes`, `staff-auth`
- **Patched:** `ticket-checkin` (who admitted a ticket comes from the account, two scanners cannot both admit
  the same ticket), `change-order-event` (administrators only, moves the seats, draws new QR pictures),
  `staff-customer-lookup`, `parse-pos-receipt`, `notify-admin-sale`, `send-invoice-email`,
  `send-payment-failed-email`, `n8n-response`, and the shared `_shared/staffAuth.ts`
- **Delete from Supabase:** `checkout-webhook` (the source is removed; deleting the deployed copy closes it)

`supabase/config.toml` sets `verify_jwt = false` for `sadad-callback` and `sadad-webhook` only among the new
ones (Sadad cannot send a login token). They accept anything but trust nothing: a payment is only confirmed
after Sadad's own API says it was paid.

## 3. Publish the new site

Merge/publish this branch. The customer flow becomes
**checkout → Sadad's hosted page → `/payment/result` → `/confirmation`** (invoice, tickets, QR codes).
`/admin/tickets` and the POS now require sign-in (account or team passcode).

## 4. Configure payments (Admin → Settings → Integrations)

- **Sadad ID**, **Secret key**, **Website domain** (exactly as registered with Sadad, no `https://`), and the
  n8n **webhook URL**: the new secret and URL from step 0.
- **Environment**: leave «تلقائي» unless Sadad support tells you otherwise. Optional **site URL** so customers
  always return to your main domain.
- Press **«تشغيل الفحص»** (readiness check): it logs in to Sadad's API and shows the callback and webhook
  URLs. Everything must be green.
- In the Sadad merchant panel → *Payment Gateway → Webhook* register
  `https://<your-project>.supabase.co/functions/v1/sadad-webhook`.

If the API login fails (test key against the wrong domain, wrong Sadad ID, or an account without the merchant
API), payments stay **pending** and staff confirm them with **«تحقق من سداد»** or manually. They are never
auto-confirmed on trust.

## 5. Apply the second migration

`supabase/migrations/20261009100200_close_open_access.sql` removes the open doors: browsers can no longer insert
orders / customers / holders, `create_public_booking` and `create_pos_booking` become server-only, and the public
order lookup stops returning ID numbers. **Only after steps 2 and 3**, or the old site cannot book.

## 6. Verify (about 15 minutes)

- **Anonymous access is closed** (use your project URL and anon key):
  ```bash
  curl -s "$URL/rest/v1/rpc/create_pos_booking" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d '{"p_customer":{"name":"x","email":"a@b.c","phone":"1"},"p_event_id":"00000000-0000-0000-0000-000000000000","p_total_amount":0,"p_booking_reference":"POS-X","p_holders":[]}'   # permission denied
  curl -s -X POST "$URL/rest/v1/orders" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'                      # permission denied
  curl -s "$URL/rest/v1/orders?select=id"     -H "apikey: $ANON"   # []
  curl -s "$URL/rest/v1/settings?select=sadad_secret" -H "apikey: $ANON"   # permission denied
  ```
- `/admin/pos`, `/admin/tickets`, `/live-bookings`, `/admin/dashboard` show the login card when signed out.
  The login page has no hidden buttons.
- **A real test payment** in Sadad test mode: book 2 tickets → pay on Sadad → you land on `/payment/result`,
  then `/confirmation` → status *confirmed* within seconds → invoice and QR codes shown → the invoice e-mail, the
  admin alert and the WhatsApp automation each fire **once**. Admin → Orders shows it confirmed and **Tickets**
  stock decreased.
- Abandon a payment: after 30 minutes the seats return to sale; the order shows *cancelled · expired*.
- A cash sale at **/admin/pos** (signed in, and once with the team passcode): confirmed at once, QR codes,
  admin alert e-mail.
- Scan a ticket in `/admin/qr-scanner`: admitted once; the second scan says already used.
- Wrong team passcode 5 times: the login says it is locked for a while (counted by the server).
- Check `payment_events` (admin-only table) for the audit trail of each callback/webhook/verification.

## 7. Afterwards

- **Online orders closed by step 1** (and any later ones) are *cancelled · expired*. If a customer says they paid,
  press **«تحقق من سداد»**: Sadad is asked directly and genuinely paid orders are confirmed again (seats are
  re-reserved if still available).
- Orders showing **«دُفع بعد انتهاء الحجز ولا توجد تذاكر»** were paid after their seats expired and sold elsewhere:
  refund them in the Sadad panel.
- Admin → Tickets → **«إعادة حساب المخزون»** recomputes the sold counters from real bookings at any time.

## Behaviour you can tune

| Rule | Where |
|---|---|
| Unpaid online booking holds seats for **30 minutes** | `c_hold_minutes` in `create_order` (migration `…100100`) |
| Max 5 admission (VIP + general) and 5 parking per online order; min 3 QAR online | same function; mirrored in the checkout page for fast feedback |
| Max 5 normal + VIP per person per event (all channels) | existing trigger `enforce_ticket_limit` (unchanged) |
| Max 4 unpaid bookings per phone number | `MAX_OPEN_ORDERS_PER_PHONE` in `create-order/handler.ts` |
| 5 wrong team passcodes in 15 minutes lock that address for 30 minutes | `PER_CALLER` in `staff-auth/handler.ts` |
| "Cash at venue" bookings hold seats until staff confirm or cancel them | Admin → Orders → «إلغاء وإعادة للبيع» |

## Testing

```bash
npm run check        # lint + types + unit tests + database tests + Deno type-check of every edge function
npm test             # 360+ unit/component tests (Sadad signing & verification, payment decisions, order creation,
                     #   staff access and throttling, post-payment follow-ups, QR round-trip ...)
npm run test:db      # replays ALL migrations (main's 114 + these 2) in an embedded Postgres, on production-shaped
                     #   data, and asserts RLS, stock, payments and the closed doors (200+ assertions)
npm run check:deno   # type-checks each edge function with the real Deno runtime (the generated `mcp` bundle is skipped)
```

## Known limitations

- The database tests run on an embedded **PostgreSQL 18**; Supabase runs 15 or 17. The migrations only use
  long-standing SQL, but step 6 exists precisely because nothing here was run against your real project.
- Two buyers taking the last ticket at the same instant is prevented by row locks inside `create_order` and the
  holder trigger. The rules are tested, but **the concurrency itself was not load-tested**. Worth a quick
  two-tab test before a big on-sale.
- Sadad's documentation describes **Web Checkout 2.1** (hosted page, `https://sadadqa.com/webpurchase`), which is
  what this release implements. If your account is only enabled for 2.2, ask Sadad to enable 2.1.
- A payment **checksum is deliberately not trusted** (it can be forged from our own request signature; see the
  test in `tests/edge/sadad-core.test.ts`). Confirmation always needs Sadad's API.
- The team passcode is a shared secret kept in the staff's browsers for 10 days. It is now strong, throttled and
  limited to staff screens, but a person who leaves the team should be followed by a new passcode.
- `@typescript-eslint/no-explicit-any` is a warning (about 180 in the existing code); the new payment, order and
  access code is fully typed. `strictNullChecks` is not enabled for the whole project.
- `package-lock.json` is updated; `bun.lockb` is a binary file this change could not regenerate, so a bun-based
  install will refresh it on first use.
- Existing, unrelated: the visitor tracker's upsert fails for anonymous visitors with a row-level-security error
  (analytics only). `public_settings` publishes the admin phone number. `npm audit` lists tooling-only issues.
