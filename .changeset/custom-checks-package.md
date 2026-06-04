---
"@alwaysmeticulous/custom-checks": patch
"@alwaysmeticulous/api": patch
"@alwaysmeticulous/client": patch
"@alwaysmeticulous/cli": patch
---

Add the `@alwaysmeticulous/custom-checks` package for writing custom check scripts: `findTestRunByCommitAndWaitForCompletion` / `findTestRunByIdAndWaitForCompletion`, `getSnapshotsFromTestRun`, and `reportCustomCheckResults`. The custom-check helpers (and `getSnapshotsFromTestRun`) move out of `@alwaysmeticulous/client` into this package, and the deprecated `plugins` CLI command is removed.
