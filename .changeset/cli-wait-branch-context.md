---
"@alwaysmeticulous/cli": minor
---

`ci upload-assets` and `ci upload-container`: `--waitForTestRunToComplete` is only allowed when Meticulous is run from a local branch checkout—pass `--repoDirectory`, or both `--baseSha` and `--gitDiffOutput`. Invocations that only pass `--commitSha` must omit the wait flag (previously they could pass validation and then block until the test run left an in-progress state).
