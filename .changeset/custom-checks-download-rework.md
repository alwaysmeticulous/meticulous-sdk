---
"@alwaysmeticulous/custom-checks": patch
---

Rework `getSnapshotsFromTestRun` to download custom check snapshots on the client. It now asks the backend for a single (once-)signed base URL plus the list of snapshot files for the test run and its base, then downloads and assembles them in parallel — instead of the backend reading, unzipping and returning every snapshot inline, which was slow (>3m) for large runs.
