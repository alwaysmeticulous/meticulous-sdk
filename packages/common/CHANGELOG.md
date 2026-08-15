# @alwaysmeticulous/common

## 2.326.0

### Minor Changes

- [#12083](https://github.com/alwaysmeticulous/meticulous/pull/12083) [`f1c9afa`](https://github.com/alwaysmeticulous/meticulous/commit/f1c9afaf7d88f35487ed7e625dccebc930a90ee2) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - `ensureBrowser` now honours an optional `METICULOUS_CHROME_BUILD_ID` environment variable, which overrides the Chrome-for-Testing version otherwise taken from the puppeteer-core pin. Unset by default, so behaviour is unchanged unless explicitly opted in.

### Patch Changes

- [#12150](https://github.com/alwaysmeticulous/meticulous/pull/12150) [`e31cd70`](https://github.com/alwaysmeticulous/meticulous/commit/e31cd700185109bf0591167fa0a28c7dfda25742) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - `ensureBrowser` now honours `PUPPETEER_EXECUTABLE_PATH` when set to an existing binary, skipping the `@puppeteer/browsers` download/install path. This unblocks arm64 cloud-replay workers that bake Chrome for Testing outside puppeteer and point at it via that env var.

## 2.324.0

### Patch Changes

- [#11890](https://github.com/alwaysmeticulous/meticulous/pull/11890) [`daf7259`](https://github.com/alwaysmeticulous/meticulous/commit/daf72590468aee89a73dea858d003efe41385b75) Thanks [@claude](https://github.com/apps/claude)! - Bump the pinned `puppeteer-core` version from `24.14.0` to `24.42.0`, so the published packages install Chrome for Testing `147.0.7727.57` instead of `138.0.7204.157`. This matches the Chrome version already used by Meticulous's cloud replay infrastructure, keeping local recording/replay/debugging behavior consistent with cloud test runs.

## 2.323.0

### Patch Changes

- [#11718](https://github.com/alwaysmeticulous/meticulous/pull/11718) [`54741e1`](https://github.com/alwaysmeticulous/meticulous/commit/54741e1ab73a0e2ffa40e59eb7a0f8340b309095) Thanks [@OCzarnecki](https://github.com/OCzarnecki)! - Removed the unused `COMMON_CHROMIUM_FLAGS` export. It was a stale duplicate of the flag list actually used when launching Chromium for replays and crawls, and had drifted out of sync with it.

- [#11675](https://github.com/alwaysmeticulous/meticulous/pull/11675) [`8346ef7`](https://github.com/alwaysmeticulous/meticulous/commit/8346ef7ff80d1e24f1ce692a61789083a0cb187e) Thanks [@sesajad](https://github.com/sesajad)! - Name the cause in `executeWithRetry`'s retry warning. The retried error was only surfaced if every attempt failed, so a request that eventually succeeded — or one whose failure was swallowed by a caller — logged `Operation failed, retrying in 889ms (attempt 2 of 4)` with no indication of what went wrong.

## 2.321.0

### Patch Changes

- [#11571](https://github.com/alwaysmeticulous/meticulous/pull/11571) [`064702f`](https://github.com/alwaysmeticulous/meticulous/commit/064702f02963eff44863ea6676c015e60e5276c1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add open review-comment counts to test-run diffs and add diff-comments CLI/MCP retrieval with nested replies, with resolved comments available on request. Share exact JSON serialization between CLI and MCP outputs.

## 2.310.0

### Patch Changes

- [#11163](https://github.com/alwaysmeticulous/meticulous/pull/11163) [`0d35d4d`](https://github.com/alwaysmeticulous/meticulous/commit/0d35d4d136ea4b0d5a7c0395189203e5831b6081) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Retry transient OpenSSL handshake errors (`ERR_SSL_PACKET_LENGTH_TOO_LONG`, `ERR_SSL_WRONG_VERSION_NUMBER`) in the shared HTTP retry helper, so clients recover from brief TLS/proxy glitches instead of failing on the first attempt.

## 2.301.0

### Minor Changes

- [#10213](https://github.com/alwaysmeticulous/meticulous/pull/10213) [`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): split custom test-run triggering into `agent upload-build` and `agent trigger-test-run`

  A build can now be registered once (`meticulous agent upload-build`, returning a `deploymentId`) and re-triggered against any base (`meticulous agent trigger-test-run --deploymentId …`), instead of the fused `ci upload-*` custom-trigger flags (now deprecated). Both agent commands wait for the run by default and print only essential output unless `--verbose` is passed; opt out of waiting with `--dontWaitForTestRunToComplete`. Adds the `uploadBuild`/`triggerTestRun` launcher helpers, the `agent*` client methods, and the `getStashCreateSha`/`getUntrackedFiles` git helpers.

  Also removes the `withUncommittedChanges` field from the deployment/test-run API surface (`@alwaysmeticulous/client`, `@alwaysmeticulous/remote-replay-launcher`, `@alwaysmeticulous/api`). It carried no behaviour the diff's presence didn't already convey — whether a run includes uncommitted changes is inferred from the uploaded git diff — so the redundant, foot-gun-prone flag is gone.

## 2.300.0

### Minor Changes

- [#10377](https://github.com/alwaysmeticulous/meticulous/pull/10377) [`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740) Thanks [@phreppo](https://github.com/phreppo)! - Add `sessionDescription` to custom-check snapshots. Each `Snapshot` now carries the session's short, human-readable description (what the user was doing in the session), or `null` when the session has no description. It is populated at replay time from data already in memory, so custom checks can label sessions in their reports without an extra lookup.

## 2.299.0

### Patch Changes

- [#10371](https://github.com/alwaysmeticulous/meticulous/pull/10371) [`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Improvements to replay downloading

## 2.298.0

### Patch Changes

- [#1237](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1237) [`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d) Thanks [@Genora51](https://github.com/Genora51)! - Retry backoff

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

## 2.290.3

### Patch Changes

- [#1199](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1199) [`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557) Thanks [@Genora51](https://github.com/Genora51)! - Remove Bitbucket Pipelines `BITBUCKET_COMMIT` auto-detection for commit SHA resolution. Commit SHA is now always inferred via `git rev-parse HEAD` when not explicitly provided.

  For Bitbucket Pipelines pull-request builds, checkout the PR source tip at the start of your pipeline step (before building): `git reset --hard "$BITBUCKET_COMMIT"`. Bitbucket merges the destination branch into the source branch during Build Setup; Meticulous does not support testing that ephemeral merge commit.

## 2.287.1

### Patch Changes

- [#1176](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1176) [`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7) Thanks [@Genora51](https://github.com/Genora51)! - Auto-detect BitBucket SHAs

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability
