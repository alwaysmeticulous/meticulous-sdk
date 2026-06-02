---
"@alwaysmeticulous/downloading-helpers": patch
"@alwaysmeticulous/client": patch
---

Fix replay download crash when the `download-urls` response includes the new nested `customCheckSnapshots` key. The download helper assumed every unrecognised top-level key was a flat `S3Location`, so the nested key caused `downloadAndExtractFile(undefined, ...)` -> `new URL(undefined)` (`ERR_INVALID_URL`), breaking all snapshotted-asset replay downloads. `customCheckSnapshots` is now excluded from the flat-artifact loop, the loop defensively skips any key without a top-level `signedUrl`, and the SDK type now declares `customCheckSnapshots`.
