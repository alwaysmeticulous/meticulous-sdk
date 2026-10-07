# Meticulous Browser Installer

`ensureBrowser()` returns the path to the Chrome for Testing build pinned by
this package's `puppeteer-core` version, downloading it on first use.

- `PUPPETEER_EXECUTABLE_PATH` — use an already-installed Chrome instead.
- `PUPPETEER_CACHE_DIR` — where to cache downloaded browsers (absolute path).
- `METICULOUS_CHROME_BUILD_ID` — pin a different Chrome for Testing build id.

Downloads honour `HTTP_PROXY` / `HTTPS_PROXY`. Requires Node.js 22.12 or newer.
