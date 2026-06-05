---
"@alwaysmeticulous/common": patch
---

Remove Bitbucket Pipelines `BITBUCKET_COMMIT` auto-detection for commit SHA resolution. Commit SHA is now always inferred via `git rev-parse HEAD` when not explicitly provided.
