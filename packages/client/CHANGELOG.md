# @alwaysmeticulous/client

## 2.298.0

### Minor Changes

- [#1235](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1235) [`27df430`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/27df430046651864302df98d548a8a91df069521) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): test-run-diffs --includeAllDiffs and --includeDomDiffIds

  `meticulous agent test-run-diffs` now aligns with the curated diffs-summary
  endpoint. The client sends `clientVersion=2` on every request, so the backend
  returns the selected representative subset by default and the command flattens
  the response into a single priority-ordered list.

  New flags: `--includeDomDiffIds` (adds the `domDiffIds` column),
  `--includeAllDiffs` (returns every diff, adds the `isSelected` column),
  `--includeMatches` (now implies `--includeAllDiffs`), and `--orderByReplayDiffs`
  (orders by replay diff then event index, adding the `index`/`total` columns).

  The command also reports `Test run is not complete (status: …)` and exits for
  in-progress runs (use `--waitForTestRunToComplete` to block — only suggested
  when waiting can actually help), fails fast on `Aborted`/`ExecutionError`, and
  gives up polling after 10 minutes. `Partial` runs are session-pool bases rather
  than test runs for a specific change, so `test-run-diffs` now rejects them as
  having no diffs to show instead of suggesting a no-op wait. The same
  completed/failed/not-complete handling is otherwise applied consistently across
  `test-run-diffs`, `js-coverage`, and `test-run-for-commit` — so `js-coverage`
  now treats `Partial`/`Aborted`/`ExecutionError` runs as having no usable
  results rather than querying them.

  Note: the default TSV output changed — `index`/`total` and `domDiffIds` are no
  longer emitted unless their flags are set, and rows default to priority order
  rather than replay-diff grouping. To approximate the previous output, pass
  `--includeAllDiffs --includeDomDiffIds --orderByReplayDiffs`. This requires a
  backend that understands `clientVersion=2`; older backends keep the legacy
  response.

### Patch Changes

- [#1237](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1237) [`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d) Thanks [@Genora51](https://github.com/Genora51)! - Retry backoff

- Updated dependencies [[`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d)]:
  - @alwaysmeticulous/common@2.298.0

## 2.297.1

### Patch Changes

- [#1233](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1233) [`142a03f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/142a03f40c4c535014b01c65cbf0a2ab4f4f0240) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - fix(client): refresh OAuth access tokens per request

  `createClientWithOAuth` previously resolved the OAuth access token once and baked it into the client for its whole lifetime. OAuth access tokens are short-lived, so long-running commands (e.g. polling a test run to completion via `--waitForTestRunToComplete`, or the custom-checks wait-for-test-run loop) would start failing once the token expired — surfacing as HTTP 401, or HTTP 404 on endpoints whose permission check is masked as not-found. The client now re-resolves the token per request (auto-refreshing via the stored refresh token) when authenticating via OAuth; static API tokens are unchanged.

## 2.297.0

### Minor Changes

- [#1171](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1171) [`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55) Thanks [@sesajad](https://github.com/sesajad)! - Add support for uploading assets as incremental chunks. New `ci upload-asset-chunk` and `ci run-with-uploaded-asset-chunks` CLI commands upload each asset chunk as a compressed `tar` archive to a signed URL, skipping chunks the server already has and warning on overlapping files.

### Patch Changes

- Updated dependencies [[`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55)]:
  - @alwaysmeticulous/api@2.297.0
  - @alwaysmeticulous/common@2.293.0

## 2.296.0

### Minor Changes

- [#1229](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1229) [`bfee3f0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/bfee3f0e146549ecfd652e58e628a5a45fa4c0f4) Thanks [@dennysem](https://github.com/dennysem)! - add backend-replay-env api

## 2.295.0

### Patch Changes

- Updated dependencies [[`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0)]:
  - @alwaysmeticulous/api@2.295.0
  - @alwaysmeticulous/common@2.293.0

## 2.294.0

### Patch Changes

- Updated dependencies [[`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb)]:
  - @alwaysmeticulous/api@2.294.0
  - @alwaysmeticulous/common@2.293.0

## 2.293.1

### Patch Changes

- [#1221](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1221) [`fd3f997`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/fd3f997d816df92aba010834e1da79383dbb62a9) Thanks [@phreppo](https://github.com/phreppo)! - Register a test run as expecting custom check results so the Meticulous UI's "Checks" tab is only shown for runs that will actually report results. `findTestRunForCustomChecks` (and `findTestRunByCommitAndWaitForCompletion`) now fire a best-effort `POST test-runs/:id/expect-custom-checks` against the effective (merged-after-network-patching) run once it is resolved — i.e. the run the user actually sees — before the caller downloads snapshots and computes the checks. Adds the `markTestRunExpectsCustomChecks` client API. The call never fails the wait: older backends without the endpoint, transient errors, or a 404 are tolerated, and reporting results marks the run as a backstop.

  Adds a `skipRegisteringExpectedCustomChecks` option to the wait helpers to suppress that signal — useful when iterating on a custom check locally against a real test run (e.g. a dry run that won't report results: you can wait for it and pull its snapshots without making the run show a "waiting for checks" tab).

  **Breaking:** renames `findTestRunByIdAndWaitForCompletion` to `findTestRunForCustomChecks` (and its options type `FindTestRunByIdAndWaitForCompletionOptions` to `FindTestRunForCustomChecksOptions`) to make its custom-checks purpose explicit. Call it at the start of a custom check script, before computing/reporting results.

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

### Patch Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

- Updated dependencies [[`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4)]:
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/api@2.293.0

## 2.292.1

### Patch Changes

- [#1217](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1217) [`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f) Thanks [@phreppo](https://github.com/phreppo)! - Report custom check results against the effective (merged) test run after network patching (session repair). When network patching is enabled, completing the original test run triggers a hidden patching run that is merged into a separate run, and that merged run is the one surfaced in the Meticulous UI. `findTestRunByIdAndWaitForCompletion` now resolves and returns this effective merged run once patching settles, falling back to the original run on older backends (404), transient errors, or timeout. Adds the `TestRunNetworkPatchingResult` type to `@alwaysmeticulous/api` and the `getTestRunNetworkPatchingResult` client API.

- Updated dependencies [[`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f)]:
  - @alwaysmeticulous/api@2.292.1
  - @alwaysmeticulous/common@2.290.3

## 2.292.0

### Patch Changes

- Updated dependencies [[`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec)]:
  - @alwaysmeticulous/api@2.292.0
  - @alwaysmeticulous/common@2.290.3

## 2.291.2

### Patch Changes

- Updated dependencies [[`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b)]:
  - @alwaysmeticulous/api@2.291.2
  - @alwaysmeticulous/common@2.290.3

## 2.291.0

### Minor Changes

- [#1206](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1206) [`a3fc01f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a3fc01fdb82cbe659c1e0969b4ab7a4d237fa04b) Thanks [@Genora51](https://github.com/Genora51)! - Inject worker network recorder into web workers when recording via CLI

## 2.290.3

### Patch Changes

- Updated dependencies [[`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557)]:
  - @alwaysmeticulous/common@2.290.3

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2
  - @alwaysmeticulous/common@2.287.1

## 2.290.0

### Minor Changes

- [#1195](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1195) [`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919) Thanks [@phreppo](https://github.com/phreppo)! - Add the `@alwaysmeticulous/custom-checks` package for writing custom check scripts: `findTestRunByCommitAndWaitForCompletion` / `findTestRunByIdAndWaitForCompletion`, `getSnapshotsFromTestRun`, and `reportCustomCheckResults`. The custom-check helpers (and `getSnapshotsFromTestRun`) move out of `@alwaysmeticulous/client` into this package, and the deprecated `plugins` CLI command is removed.

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0
  - @alwaysmeticulous/common@2.287.1

## 2.289.2

### Patch Changes

- [#1191](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1191) [`8731225`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/8731225adb4cf22c9d1341972583931369c17882) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Allow consumers to append an app identifier to the client `User-Agent` (e.g. `@alwaysmeticulous/client/<version> report-diffs-action/cloud-compute@v1`), so backend logs can attribute traffic to a specific consumer and version. The suffix comes from the new `appInfo` option on `createClient`, falling back to the `METICULOUS_CLIENT_USER_AGENT_SUFFIX` env var — the env var also reaches clients built deep inside dependencies (e.g. the bundled `remote-replay-launcher`'s own client) where threading an option through is not possible.

## 2.289.1

### Patch Changes

- Updated dependencies [[`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef)]:
  - @alwaysmeticulous/api@2.289.1
  - @alwaysmeticulous/common@2.287.1

## 2.289.0

### Patch Changes

- [#1187](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1187) [`966e0b0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/966e0b0e110442a552aa0937c0570db7defd38a8) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Stamp a `User-Agent` header (`@alwaysmeticulous/client/<version>`) on every request made by the client, so the backend can attribute traffic to a specific client version. The version is inlined at build time from `package.json` via a generated `version.ts`.

## 2.288.2

### Patch Changes

- [#1185](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1185) [`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323) Thanks [@phreppo](https://github.com/phreppo)! - Add support for authoring and locally running custom check plugins: custom check authoring types in `@alwaysmeticulous/api`, a `getSnapshotsFromTestRun` client API, and a `meticulous plugins execute-custom-check-locally` CLI command that runs a custom check plugin against the snapshots of a test run.

- Updated dependencies [[`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323)]:
  - @alwaysmeticulous/api@2.288.2
  - @alwaysmeticulous/common@2.287.1

## 2.288.1

### Patch Changes

- [#1183](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1183) [`4e97f21`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/4e97f216670021a925f8beac64657985180a6edc) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Fix replay download crash when the `download-urls` response includes the new nested `customCheckSnapshots` key. The download helper assumed every unrecognised top-level key was a flat `S3Location`, so the nested key caused `downloadAndExtractFile(undefined, ...)` -> `new URL(undefined)` (`ERR_INVALID_URL`), breaking all snapshotted-asset replay downloads. `customCheckSnapshots` is now excluded from the flat-artifact loop, the loop defensively skips any key without a top-level `signedUrl`, and the SDK type now declares `customCheckSnapshots`.

## 2.288.0

### Patch Changes

- Updated dependencies [[`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b)]:
  - @alwaysmeticulous/api@2.288.0
  - @alwaysmeticulous/common@2.287.1

## 2.287.1

### Patch Changes

- Updated dependencies [[`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7)]:
  - @alwaysmeticulous/common@2.287.1

## 2.286.0

### Patch Changes

- Updated dependencies [[`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963)]:
  - @alwaysmeticulous/api@2.286.0
  - @alwaysmeticulous/common@2.283.1

## 2.285.2

### Patch Changes

- Updated dependencies [[`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71)]:
  - @alwaysmeticulous/api@2.285.2
  - @alwaysmeticulous/common@2.283.1

## 2.285.1

### Patch Changes

- Updated dependencies [[`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe)]:
  - @alwaysmeticulous/api@2.285.1
  - @alwaysmeticulous/common@2.283.1

## 2.285.0

### Patch Changes

- Updated dependencies [[`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03)]:
  - @alwaysmeticulous/api@2.285.0
  - @alwaysmeticulous/common@2.283.1

## 2.284.0

### Minor Changes

- [#1144](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1144) [`60154f4`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/60154f4e5a901423bf28e3deb37f5a6164d83ad3) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - cli: route all commands through unified OAuth-aware auth flow

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability

- Updated dependencies [[`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0)]:
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/api@2.283.1

## 2.283.0

### Minor Changes

- [#1143](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1143) [`0806546`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0806546254d3e63167b7406dc1cf8483a06c4003) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - debug-workspace: retrieve PR description from backend

## 2.281.0

### Minor Changes

- [#1137](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1137) [`f6f780e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f6f780ebd294643d3d0f659187af4b4e624477aa) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - debug-workspace: support non-CLI runners and fetch PR diff via API
