# Task Roadmap

## Complete live-bookings festival calendar
- [ ] Show every active, non-archived festival day from 7–14 November 2026, including completed days, in the calendar and booking results; exclude older seasons.

## Live booking labels and completed festival days
- [x] Replace remaining raw ticket-type labels across live-bookings summaries; authenticated page has all three Arabic labels and no standalone parking/vip/normal labels.
- [x] Restore 7 and 8 November in daily sales while excluding previous seasons; authenticated popup shows all eight festival days (8 November: QAR 34,300), 14 regression tests passed, build clean, feed deployed. Frontend changes await publication.

## New booking notification presentation
- [x] Show purchased normal/VIP/parking counts with nationality and Qatar event date; bottom-up animation and subtle fireworks. Eleven tests passed, build clean; isolated desktop/mobile toast verified upward entrance, five-second dismissal, close control and no overflow. Preview had no mounted toast host, so a temporary browser-only host verified presentation; a real new-booking poll was not exercised. POS and stock alerts unchanged.

## Server WhatsApp POS exclusion
- [x] Guard countdown, legacy n8n triggers, payment follow-ups and retries before attempts/HTTP using trusted confirmed Sadad/QTR orders and current festival eligibility. Six send/payment functions deployed; 528 tests passed. Authenticated live requests for a real 8 November POS booking rejected send_invoice, send_ticket and retry with pos_order. No messages sent or historical delivery states changed; fresh QTR provider delivery was not exercised.

## Receipt pricing and amount corrections
- [x] Receipt summary/export use the selected active festival day's actual prices (verified 300/500/500 QAR); saved amount correction persisted after reload and original amount restored. Eleven pricing/validation/output tests passed; function deployed. Desktop/mobile checked without overflow or runtime errors; preview verification bypassed stale module caching.

## Live attendance display
- [x] Normalize both live reads before cards, tables, statistics and notification snapshots: POS always displays present; online attendance retains scanner holder state. Nine tests passed, build clean; authenticated existing POS cards/table verified and a simulated scanned-holder response updated on the next poll (2 → 3 present), no runtime errors. No real customer was checked in; stored attendance and payments unchanged.

## Remaining monitoring and browser errors
- [x] Verified all three findings: checkout and staff-link evidence stale; invoice-history polling restored to 30 seconds, paused while hidden and overlap guarded. Authenticated invoices made zero delivery-history calls during a 6.5-second observation; no pending monitoring findings remain.
- [x] Live refresh queues catch-up, empty scope cannot read old bookings, and date selection no longer hides other festival-day notifications. Older-browser fullscreen/audio failures are handled. Real admin stock increase produced popup, two oscillators and animated dismissal at ten-second refresh; original capacity restored. Mobile simulated password-feed alert appeared/dismissed with no overflow; actual password authentication remains unverified.
- [x] Secure random-ID fallback and first-mount cached-chunk recovery repaired; all 506 tests passed, build clean and authenticated browser had no runtime errors. Historical logs retained; external SCDynimacBridge/Object Not Found/cross-origin-frame errors cannot be attributed to current application code and were not suppressed or marked resolved.

## Live bookings ten-second updates
- [x] Refresh admin/password viewers every 10 seconds; compare booking/attendance snapshots and ticket-ID stock across festival days. Feed deployed; four regression tests passed. Authenticated UI stock increase showed «تمت إضافة 1 تذاكر», two beep oscillators and automatic dismissal, with a measured 10-second refresh gap; original stock restored. Password-view end-to-end remains unverified.

## Staff orders
- [x] Add /staff/orders and hub link with server-validated read-only reads; admin controls remain available, staff-page delete/cancel/date controls absent. Existing table mutation policies remain admin-only; read endpoint rejects mutations (403) and anonymous reads (401). Actual shared-password/moderator session remains unverified; staff authorization unit tests pass.
- [x] Scope both order pages and date targets to 7–14 November 2026 in Qatar; authenticated list/details verified, 99 confirmed / 54 failed, old-season search empty, mobile has no horizontal overflow; 55 authorization/range tests passed. staff-orders and change-order-event deployed; build clean.

## Orders festival scope
- [x] Show only the actual festival (7 → 14 November 2026) on /admin/dashboard/orders: list, search, statistics and the date picker all use the non-archived day span from src/lib/festivalWindow.ts; authenticated browser verified 98 confirmed / 53 failed matching the database, archived-season search returns nothing, each day listed once.

## Scanner current-event attendance
- [x] Restrict all scanner lookups and attendance history to the active current festival (or the admin-selected single event); removed previous-event related lists, archived-code lookup verified empty, ticket-checkin deployed.
- [x] Add admin cancellation to customer results, ticket selection and duplicate alert; authenticated UI cancellation/readback verified, payment unchanged and original attendance restored; 35 scanner/security regressions passed.

## Receipt reading repair
- [x] Reproduced unauthenticated storage rejection; moved photo save and receipt list/edit/delete into the staff-validated receipt function, with no public-write changes and unchanged AI quotas. Supplied photo saved as QAR 200 / 001036002 / 12:06:02 / 020459 and reloaded using admin UI; verification records/photos removed. 35 validation/auth tests passed. Native camera and an actual team-password session remain unverified.
- [x] Fixed reproduced truncated extraction output; supplied photo extracted QAR 200, sequence 001036002, time 12:06:02 and authorization 020459, saved and reloaded once; verification receipt/images removed, quotas unchanged, four tests passed. Native phone-camera capture remains device-specific and unverified.

## Home banner controls
- [x] Add independent saved top/center/bottom image alignment and height controls; authenticated save/reload and public top/bottom at 520px verified, mobile checked, 4 tests passed, original center/600px restored without changing other settings.

## Manual invoice delivery
- [x] Add admin manual WhatsApp confirmation with audit history and exclusion from automated sends; authenticated save/reload verified on a previously provider-confirmed invoice, original state restored without sending messages; 10 rule tests passed and senders deployed. Provider counts remain independent; in-flight n8n requests cannot be recalled.
- [x] Inspect real n8n/provider responses, persist outgoing message proof and locked attempt numbers, reject unproven success, and verify authenticated history with a real provider message ID; 36 tests passed, active n8n readback matched both callbacks, affected functions deployed. No messages resent; fresh delivery to a customer phone remains unverified.
- [x] Retrieve QTR-7-11-2026-9A657F69875B in the manual invoice page and save five enabled Arabic WhatsApp messages with customer name, order details and invoice link; authenticated search and save/reload verified, no customer message sent.
- [x] Find the named archived booking through exact-reference search without exposing archived invoices to automatic sending; authenticated browser verified.
- [x] Add WhatsApp send/resend with channel-specific delivery history and counts; 71 focused assertions passed, named invoice shows one historic email send.
- [x] Add Settings message templates with random selection; save/reload verified, original templates restored without sending customer messages.
- [x] Fix both n8n WhatsApp callback paths to preserve Webhook delivery_id and require provider success plus an outgoing message ID before recording success; saved active workflow readback verified, real prior execution data and simulated failure passed, 11 focused tests passed. No messages resent or historical statuses changed; a fresh full send remains unverified.

## Sadad credential source
- [x] Correct Checkout uppercase/mandatory-field signing; official public example and payment-proof regressions passed (197 tests), create-order/sadad-payment/sadad-diagnose deployed, authenticated live diagnostic shows updated guidance with API rejected and Checkout unverified. No booking or payment created.
- [x] Trace the actual merchant login safely and compare official documentation: live/sandbox returned HTTP 401 with documented request shape; diagnostics separate API outcome from unverified Checkout, flag lowercase/extra signed fields and conflicting date documentation; 109 tests and authenticated browser check passed. No payment signing changes or real charge performed.
- [x] Make all Sadad connections use admin settings exclusively; transaction details and diagnostics deployed, alternate-secret/domain fallbacks removed, 150 tests passed and authenticated live diagnostic verified. Sadad still rejects the saved credentials; successful real payment remains unverified.

## Public camel artwork
- [x] Apply a top-to-bottom opacity fade to the pre-footer image; browser verified saved opacity 32%, horizontal repetition, unchanged 312×290px tiles and smooth fade; build OK.
- [x] Add saved admin controls for pre-footer horizontal/vertical repetition and opacity, preserving natural image size; authenticated save/reload and public vertical display at 35% verified, original settings restored; 3 tests passed.
- [x] Reduce footer artwork height without cropping or distortion; add supplied illustration as a faint central public-page background and verify both on desktop/mobile.
- [x] Tile the footer camel artwork horizontally at its unchanged height using the seamless 6-period tile; verified seamless at 1280px and 390px.
- [x] Remove all fixed footer text (site nav links, "دفع عبر سداد" badge, card logos, hardcoded year prefix); footer keeps only the logo and the dashboard-editable copyright line; verified desktop/mobile.
- [x] Render the pre-footer image (settings.before_footer_image_url) at its natural size, tiled horizontally via the shared BeforeFooterImage component on home, tickets and checkout; verified 323px tall repeat-x at 1280px with no stretching.


## Festival guideline styling
- [x] Apply visually verified guideline colors and original heritage artwork to existing public layouts.
- [ ] Load Adapter Arab for all visitors — awaiting licensed WOFF/WOFF2 files; local licensed font detection and existing Arabic fallback are in place.
- [x] Preserve booking logic; public desktop/mobile pages and legal links verified without overflow or runtime errors; 14 ticket/payment/time tests passed.
- [ ] Verify a real booking after styling — blocked because no event is currently available for sale; no test events or orders created.

## Public quality audit
- [x] Improve public mobile layout and not-found recovery; remove purple-gradient styling.
- [x] Add working footer legal links, draft privacy and terms pages, search/share metadata and sitemap. Hosting supplies the share image; published-version verification requires publication.
- [x] Audit private-key exposure, enforce receipt AI limits and separate heavy JavaScript chunks; public publishable keys are not secrets.
- [x] Verify public flows on desktop and mobile, authenticated AI input rejection, and tests: 418 application tests and 221 database assertions passed.

1. ✅ Remove "الدخول كفريق / روابط سريعة" button from `/admin/login`
2. ✅ Add list/grid view toggle to admin notifications page
3. ✅ Change booking reference format to include event date:
   - Online: `QTR-3-9-2026-xxxxxx`
   - POS: `POS-3-9-2026-xxxxxxxxxx`
4. ✅ Ensure admin notifications page loads updates in real-time without page refresh
5. ✅ Visitor tracking re-enabled + "الزوار مقابل الحضور" admin page
6. ✅ Live gate board `/staff/gate` (manual + 15s auto refresh)
7. ✅ Team-password access can mark individual attendance; bulk marking/clearing remains account-only.
8. ✅ Staff accounts page (create / role / revoke / reset password)
9. ✅ Login throttling + admin email alert (login-guard)
