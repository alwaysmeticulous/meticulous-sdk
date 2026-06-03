---
"@alwaysmeticulous/client": patch
---

Stamp a `User-Agent` header (`@alwaysmeticulous/client/<version>`) on every request made by the client, so the backend can attribute traffic to a specific client version. The version is inlined at build time from `package.json` via a generated `version.ts`.
