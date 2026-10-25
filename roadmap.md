# Task Roadmap

## Manual invoice delivery
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
7. ✅ Attendance edits require a real account session (passcode = read-only)
8. ✅ Staff accounts page (create / role / revoke / reset password)
9. ✅ Login throttling + admin email alert (login-guard)
