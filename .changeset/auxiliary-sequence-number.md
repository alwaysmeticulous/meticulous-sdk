---
"@alwaysmeticulous/api": minor
---

Add required `sequenceNumber` (0-indexed) to `ScreenshotAuxiliary` so multiple auxiliary screenshots sharing the same `eventNumber` and `reason` can be deterministically ordered.
