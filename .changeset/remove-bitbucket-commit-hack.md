---
"@alwaysmeticulous/common": patch
---

Remove Bitbucket Pipelines `BITBUCKET_COMMIT` auto-detection for commit SHA resolution. Commit SHA is now always inferred via `git rev-parse HEAD` when not explicitly provided.

For Bitbucket Pipelines pull-request builds, checkout the PR source tip at the start of your pipeline step (before building): `git reset --hard "$BITBUCKET_COMMIT"`. Bitbucket merges the destination branch into the source branch during Build Setup; Meticulous does not support testing that ephemeral merge commit.
