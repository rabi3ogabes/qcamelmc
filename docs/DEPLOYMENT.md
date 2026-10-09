# Deployment runbook

Everything here is verified by automated tests against a replay of your real migrations (see
[Testing](#testing)), **but not against your live Supabase project or the live Sadad gateway** —
that is what the checklist in step 6 is for. Follow the steps in order: the new site and functions
must be live **before** the lockdown migration, because the old site reads and writes tables that
the lockdown closes.

## 0. Do these now (independent of the code)

1. **Change the admin password** of the account whose credentials were hard-coded on the login page
   (they shipped in the public JavaScript and sit in git history since 2025‑10‑03). If that password is
   used anywhere else, change it there too. Assume it is known.
2. Supabase → Authentication: review **users and sign-in logs** for unexpected logins, and
   **disable public sign-ups** (an unwanted account could not read data after the lockdown, but there is no
   reason to allow it).
3. **Rotate the Sadad secret key** in the Sadad merchant panel and **replace the n8n webhook URL**
   (create a new webhook path in n8n). Both were readable by anyone until now. Enter the new values in
   step 4 — not before, or the old site would break.

## 1. Apply the additive migrations (safe while the old site is live)

In order, via Lovable's database tool or the Supabase SQL editor:

| File | What it does |
|---|---|
| `supabase/migrations/20261009100000_payment_status_failed.sql` | adds the `failed` order state |
| `supabase/migrations/20261009100100_orders_payments_additive.sql` | admin-only `private_settings` (your current secrets are **copied** there), stock triggers, `create_order` & payment functions, QR picture column, audit table, one-off stock recount |

Run them as **two separate executions** (a new enum value cannot be used in the transaction that adds it).

## 2. Deploy the edge functions

Deploy everything under `supabase/functions/` (Lovable does this on sync; with the CLI:
`supabase functions deploy`). New: `create-order`, `sadad-callback`, `sadad-webhook`, `verify-payment`,
`sadad-diagnose`. Rewritten: `sadad-payment`, `ticket-checkin`, `send-to-webhook`, `generate-qr-code`,
`backfill-qr-codes`, `regenerate-booking-qr-codes`.

`supabase/config.toml` sets `verify_jwt = false` for **only** `sadad-callback` and `sadad-webhook` (Sadad
cannot send a login token). Make sure that setting is honoured by your deploy. These two accept anything
but trust nothing: a payment is only confirmed after Sadad's own API says it was paid.

Each function folder is self-contained (`_shared/` is a generated copy); after editing
`supabase/functions/_shared/*`, run `npm run sync:functions`.

## 3. Publish the new site

Merge/publish this branch. The customer flow changes from an in-page iframe to Sadad's hosted page:
**checkout → Sadad → `/payment/result`** (which verifies and shows the tickets).

## 4. Configure payments (Admin → Settings)

- **Sadad ID**, **Secret key**, **Website domain** (exactly as registered with Sadad, no `https://`), and the
  n8n **webhook URL** — the new secret and URL from step 0.
- Press **«تشغيل الفحص» (readiness check)**. It logs in to Sadad's API (test or live, detected from your key) and
  shows the two URLs below. Everything must be green.
- In the Sadad merchant panel → *Payment Gateway → Webhook*, register  
  `https://<your-project>.supabase.co/functions/v1/sadad-webhook`.  
  (The customer return URL is sent automatically with every payment.)
- Optional: set **Site URL** so customers always return to your main domain.

If the check says the API login failed: the key is a *test* key used against the wrong domain, the Sadad ID
is wrong, or your Sadad account does not expose the merchant API. Payments will then stay **pending** and
staff confirm them with the **«تحقق من سداد»** button (or manually) — they are never auto-confirmed on trust.

## 5. Apply the lockdown migration

`supabase/migrations/20261009100200_lockdown_private_data.sql` — closes public access to customers, orders,
ticket holders and the gateway secrets, and removes the secret columns from the public `settings` table.
It refuses to run if `private_settings` is empty, and carries over any edit made through the old settings
screen during the rollout (most recent edit wins).

## 6. Verify (≈15 minutes)

- **Anonymous access is closed** (use your project URL and anon key):
  ```bash
  curl -s "$URL/rest/v1/customers?select=id"            -H "apikey: $ANON"   # permission denied / []
  curl -s "$URL/rest/v1/orders?select=id"               -H "apikey: $ANON"   # permission denied
  curl -s "$URL/rest/v1/settings?select=sadad_secret"   -H "apikey: $ANON"   # column does not exist
  curl -s "$URL/rest/v1/private_settings?select=*"      -H "apikey: $ANON"   # permission denied
  ```
- `/admin/pos`, `/admin/dashboard`, `/live-bookings` redirect to the login page when signed out.
- **A real test payment** in Sadad test mode: book 2 tickets → pay on Sadad → you land on
  `/payment/result` → status becomes *confirmed* within seconds → QR codes shown → WhatsApp automation fires
  once. Check Admin → Orders shows it confirmed and **Tickets** stock decreased.
- Abandon a payment: after 30 minutes the seats return to sale (the next booking for that event releases them).
- Scan a ticket in `/admin/qr-scanner`: admitted once; the second scan says already used.
- Check `payment_events` (admin-only table) for the audit trail of each callback/webhook/verification.

## 7. Afterwards

- **Old pending online orders** (created before this release, when confirmation did not work) were *not*
  auto-expired — they may have been paid. In Admin → Orders → *Pending*, press **«تحقق من سداد»** on each:
  Sadad is asked directly and genuinely paid ones are confirmed.
- Orders showing **«دُفع بعد انتهاء الحجز ولا توجد تذاكر»** were paid after their seats expired and sold elsewhere:
  refund them in the Sadad panel.
- Admin → Tickets → **«إعادة حساب المخزون»** recomputes the sold counters from real bookings at any time.

## Behaviour you can tune

| Rule | Where |
|---|---|
| Unpaid online booking holds seats for **30 minutes** | `c_hold_minutes` in `create_order` (migration `…100100`) |
| Max 5 admission (VIP + general) and 5 parking per online order; min 3 QAR online | same function; mirrored in `Checkout.tsx` for fast feedback |
| Max 4 unpaid bookings per phone number | `MAX_OPEN_ORDERS_PER_PHONE` in `create-order/handler.ts` |
| "Cash at venue" bookings hold seats until staff confirm or cancel them | Admin → Orders → «إلغاء وإعادة للبيع» |

## Testing

```bash
npm run check        # lint + types + edge-function sync + unit tests + DB tests + Deno type-check
npm test             # 300+ unit/component tests (Sadad signing & verification, payment decisions, order
                     #   creation, gate check-in, route guard, polling, QR round-trip …)
npm run test:db      # replays ALL migrations in an embedded Postgres and asserts RLS, stock, payments
npm run check:deno   # type-checks every edge function with the real Deno runtime
```

## Known limitations

- The database tests run on an embedded **PostgreSQL 18**; Supabase runs 15 or 17. The migrations only use long-standing
  SQL (`jsonb_to_recordset`, `ROWS FROM … WITH ORDINALITY`, `FOR UPDATE SKIP LOCKED`, `NOT VALID` constraints), but step 6
  exists precisely because nothing here was run against your real project.
- Two buyers taking the last ticket at the same instant is prevented by row locks inside `create_order`. The stock
  rules are tested, but the **concurrency itself was not load-tested** (the embedded database used for tests has a
  single connection). Worth a quick two-tab test before a big on-sale.

- Sadad's documentation describes **Web Checkout 2.1** (hosted page, `https://sadadqa.com/webpurchase`), which is
  what this release implements. The previous iframe flow (Web Checkout 2.2) is listed by Sadad as "coming soon";
  if your account is only enabled for 2.2, contact Sadad to enable 2.1.
- A payment **checksum is deliberately not trusted** (it can be forged from our own request signature; see the
  test in `tests/edge/sadad-core.test.ts`). Confirmation always needs Sadad's API.
- `npm audit` still lists tooling-only issues in Tailwind's file watcher and a moderate `react-router` v6
  advisory whose fix is the v7 major upgrade; the app never navigates to attacker-controlled URLs.
- `.env` (public keys only) is tracked because Lovable manages it; `bun.lockb` and `package-lock.json` both exist.
