---
"@alwaysmeticulous/api": patch
"@alwaysmeticulous/client": patch
"@alwaysmeticulous/cli": patch
---

Add support for authoring and locally running custom check plugins: custom check authoring types in `@alwaysmeticulous/api`, a `getSnapshotsFromTestRun` client API, and a `meticulous plugins execute-custom-check-locally` CLI command that runs a custom check plugin against the snapshots of a test run.
