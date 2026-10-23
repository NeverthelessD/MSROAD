#!/usr/bin/env python3
"""docs/guide.html → docs/MSROAD_사용가이드.png, docs/guide-win.html → docs/MSROAD_Windows_사용가이드.png
(Playwright + Chromium 필요) · python3 scripts/guide.py [mac|win]"""
import sys
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 800}, device_scale_factor=2)
        which = sys.argv[1:] or ["mac", "win"]
        for k, src, out in [("mac", "guide.html", "MSROAD_사용가이드.png"), ("win", "guide-win.html", "MSROAD_Windows_사용가이드.png")]:
            if k not in which:
                continue
            await pg.goto("file://" + os.path.join(ROOT, "docs", src))
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=os.path.join(ROOT, "docs", out), full_page=True)
        await b.close()
asyncio.run(main())
