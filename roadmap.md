# Task Roadmap

## Public quality audit
- [ ] Improve public mobile layout and not-found recovery; remove purple-gradient styling.
- [ ] Add working footer legal links, privacy and terms pages, search/share metadata and sitemap.
- [ ] Audit private-key exposure, AI limits and JavaScript loading; fix confirmed issues.
- [ ] Verify public flows on desktop and mobile and run relevant tests.

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
