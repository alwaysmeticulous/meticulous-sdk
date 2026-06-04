---
"@alwaysmeticulous/custom-checks": minor
"@alwaysmeticulous/api": minor
"@alwaysmeticulous/client": minor
"@alwaysmeticulous/cli": minor
---

Add the `@alwaysmeticulous/custom-checks` package for writing custom check scripts: `findTestRunByCommitAndWaitForCompletion` / `findTestRunByIdAndWaitForCompletion`, `getSnapshotsFromTestRun`, and `reportCustomCheckResults`. The custom-check helpers (and `getSnapshotsFromTestRun`) move out of `@alwaysmeticulous/client` into this package, and the deprecated `plugins` CLI command is removed.
