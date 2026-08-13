# Audit result + hardening plan

## What I checked
- Production build: passes (14.5s), no TypeScript errors.
- Lint: 128 errors, all cosmetic (`any` types, `prefer-const`) — no runtime impact.
- Backend security scan: **5 critical issues**.
- Performance: a few heavy queries and oversized bundles.

## Critical security issues found

1. **Payment secrets are public.** The `settings` table is readable by anyone on the internet, including `sadad_api_key`, `sadad_secret`, `sadad_merchant_id`, `webhook_url` and `admin_phone`. Anyone can read them with one request.
2. **All customer data is public.** `customers` (3213+ rows: name, email, phone, national ID) is readable by anyone.
3. **All attendee data is public.** `ticket_holders` (names, phones, ID numbers, nationality, QR codes) is readable by anyone — meaning QR codes can be harvested.
4. **All orders are public.** The "customers can view their own orders" rule is broken and effectively matches every order (amounts, payment IDs, payment status).
5. Several database functions miss a fixed `search_path`.

Admin login already uses real authentication (`admin_users` + `auth.uid()`), so we can lock these tables down without rebuilding auth.

## Fix plan

### 1. Settings
- Remove the public read rule on `settings`.
- Add a read-only public view exposing only display fields (logo, colors, hero text, copyright, current event, button flags).
- Point all public pages (home, ticket selection, checkout, confirmation, login header) at that view.
- Move the checkout's `webhook_url` / `admin_phone` read into the existing edge function (server-side only).

### 2. Customers / orders / ticket holders
- Drop the `true` read rules and the broken "own orders" rule.
- Keep public INSERT (checkout must keep working).
- Add an edge function `order-lookup` that returns one order + its tickets by booking reference — used by Confirmation, Sadad callback and the ticket viewer.
- Add a database function returning only ticket **counts** per event for availability checks (no personal data).
- Admin screens keep working unchanged through the existing admin rules.

### 3. Staff pages
`/live-bookings`, `/live-visitors`, `/admin/pos`, `/admin/qr-scanner` will require an admin session (redirect to login when signed out), since their data is no longer public.

### 4. Database functions
Set a fixed `search_path` on all functions flagged by the linter.

## Performance / cleanliness
- Lifetime ticket totals currently pull **every** ticket holder row into the browser; replace with a single aggregated database function (big win on the Live Bookings page).
- Split the largest bundles (`xlsx`, settings page, scanner libs) so the public pages load only what they need.
- Add indexes for the hot lookups (booking reference, order id, event id + status) so 1000 concurrent visitors don't hit slow scans.
- Auto-fix the safe lint errors and drop the remaining dead code.

## Notes
No data is deleted or modified anywhere in this plan — only access rules, queries and bundling change.
