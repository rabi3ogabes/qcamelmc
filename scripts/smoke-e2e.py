#!/usr/bin/env python3
"""Browser smoke test: opens the public, admin, POS and scanner pages and reports console errors.

Usage: python3 scripts/smoke-e2e.py [base_url]   (default http://localhost:8080)
Exit code 1 when any page shows a console error or a page error.
"""
import asyncio
import sys
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
PAGES = ["/", "/checkout", "/payment/result", "/admin/login", "/admin/dashboard/orders",
         "/admin/pos", "/admin/qr-scanner", "/staff", "/staff/gate"]
IGNORE = ("forwardRef", "Download the React DevTools", "camera", "NotAllowedError")


async def main() -> int:
    failures = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for path in PAGES:
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            try:
                await page.goto(BASE + path, wait_until="networkidle", timeout=30000)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"navigation: {exc}")
            await page.wait_for_timeout(1500)
            errors = [e for e in errors if not any(i in e for i in IGNORE)]
            status = "OK " if not errors else "ERR"
            print(f"{status} {path}")
            for e in errors[:5]:
                print(f"     - {e[:300]}")
            failures += bool(errors)
            await ctx.close()
        await browser.close()
    print(f"\n{len(PAGES) - failures}/{len(PAGES)} pages without console errors")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
