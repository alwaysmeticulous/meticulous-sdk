---
"@alwaysmeticulous/api": patch
"@alwaysmeticulous/client": patch
"@alwaysmeticulous/custom-checks": patch
---

Report custom check results against the effective (merged) test run after network patching (session repair). When network patching is enabled, completing the original test run triggers a hidden patching run that is merged into a separate run, and that merged run is the one surfaced in the Meticulous UI. `findTestRunByIdAndWaitForCompletion` now resolves and returns this effective merged run once patching settles, falling back to the original run on older backends (404), transient errors, or timeout. Adds the `TestRunNetworkPatchingResult` type to `@alwaysmeticulous/api` and the `getTestRunNetworkPatchingResult` client API.
