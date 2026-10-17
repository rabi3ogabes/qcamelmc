# Task Roadmap

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
