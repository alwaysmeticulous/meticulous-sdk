---
"@alwaysmeticulous/remote-replay-launcher": minor
"@alwaysmeticulous/client": minor
"@alwaysmeticulous/common": minor
"@alwaysmeticulous/cli": minor
---

Split triggering a custom test run into two `agent`-namespace commands so a build and a test run can evolve (and be (re-)triggered) independently:

- **`meticulous agent upload-build`** uploads a build — static assets (`--appDirectory`/`--appZip`, auto-detected) or a Docker container (`--localImageTag`) — and registers a reusable deployment **without triggering a run**, printing the `deploymentId`. The build's `--commitSha` must identify a real commit (defaults to HEAD); a dirty working tree is captured as an ephemeral `git stash create` commit (with a stderr note), so the deployment's commit faithfully describes what ran. No `--baseSha`/`--gitDiffOutput` here — those are comparison inputs.
- **`meticulous agent trigger-test-run`** now takes `--deploymentId` (from `upload-build`) plus the comparison inputs (`--baseSha`, `--gitDiffOutput`, or `--repoDirectory` to infer both), optionally waiting for completion. The head commit comes from the deployment.

New SDK building blocks back these: `uploadBuild` / `triggerRun` in `@alwaysmeticulous/remote-replay-launcher`; `agentUploadAssetBuild`, `agentUploadContainerBuild`, `agentRequestGitDiffUpload`, `agentTriggerTestRun` in `@alwaysmeticulous/client`; and `getStashCreateSha` in `@alwaysmeticulous/common`.

The deprecated `ci upload-assets` / `ci upload-container` commands keep their existing fused behaviour (upload + trigger in one call) against the existing endpoints.
