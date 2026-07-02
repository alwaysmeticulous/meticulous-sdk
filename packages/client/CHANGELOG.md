# @alwaysmeticulous/client

## 2.303.1

### Patch Changes

- [#10577](https://github.com/alwaysmeticulous/meticulous/pull/10577) [`5ae77f3`](https://github.com/alwaysmeticulous/meticulous/commit/5ae77f305b7cbd59174f7e5e73c454ece794099f) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add the concept of sensitive cookies/headers

- Updated dependencies []:
  - @alwaysmeticulous/common@2.301.0

## 2.302.0

### Minor Changes

- [#10515](https://github.com/alwaysmeticulous/meticulous/pull/10515) [`132ce89`](https://github.com/alwaysmeticulous/meticulous/commit/132ce893095bc0eb89abb000ae4982f3fed85355) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): richer `agent js-coverage` columns and filters for whole test runs

  `agent js-coverage` can now emit, in addition to the executed line ranges, the executable line ranges (`--includeExecutableRanges`), the uncovered ranges (executable − executed, `--includeUncoveredRanges`) and a per-file coverage percentage (`--includeCoveragePercentage`); columns appear after `repoFilePath` in that fixed order. A file is dropped unless at least one requested column has a value for it (so an executed-only request returns only files with executed lines, while requesting uncovered ranges already includes never-executed files); `--includeAllFiles` returns every file regardless. Coverage can be scoped to the PR diff with `--prDiffOnly` and filtered to matching repo paths with `--globFilter`. The executable/uncovered/percentage columns and `--prDiffOnly` rely on whole-test-run data and are rejected alongside `--replayId`.

  `--globFilter` and `--includeAllFiles` now apply to a single replay, a whole test run, and the `js-coverage-diff` command alike — for the diff, `--globFilter` scopes base, head, and the diff, and `--includeAllFiles` keeps base/head rows with no executed ranges (dropped by default).

  The client's `getTestRunJsCoverage` sends a `clientVersion` and returns the detailed per-file (V2) response; the backend keeps serving the legacy tuple-keyed executed-ranges response to pre-versioning clients. `getTestRunJsCoverage` defaults to executed ranges when no column option is passed, so a bare `getTestRunJsCoverage(client, testRunId)` keeps returning executed ranges rather than erroring.

  `getReplayJsCoverage` and `getReplayDiffJsCoverage` now take `screenshotName` as a positional argument (`(client, id, screenshotName?, options?)`) rather than inside the `options` object, since it selects _which_ coverage to fetch rather than shaping the response. Any caller passing `screenshotName` inside `options` must move it to the third argument.

- [#10524](https://github.com/alwaysmeticulous/meticulous/pull/10524) [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent trigger-test-run` now accepts `--commitSha` as an alternative to
  `--deploymentId`: it resolves to the most recent non-ephemeral deployment
  already uploaded for that commit in the project (e.g. by an earlier CI run),
  so you don't need to look up a `deploymentId` to re-trigger a run — for
  example to test the coverage impact of `--sessionIds` against a commit that
  has already gone through Meticulous. Exactly one of `--deploymentId` or
  `--commitSha` is required. `--commitSha` cannot be combined with a git diff
  (`--gitDiffOutput`, or one inferred via `--repoDirectory`), since uploading a
  diff requires an already-known deployment to key it by.

- [#10524](https://github.com/alwaysmeticulous/meticulous/pull/10524) [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add an optional `--sessionIds` argument to `agent trigger-test-run`. When
  provided (a comma-separated list of session IDs), the run replays exactly those
  sessions — for both the base and the head — instead of the project's
  auto-selected ("golden set") sessions. When omitted, behaviour is unchanged.
  An explicitly-provided list that is empty or contains duplicate session IDs is
  rejected up front (at the agent endpoint) rather than silently falling back to
  the golden set or de-duplicating.

  Note: as part of this change, externally-supplied session IDs (the agent
  `--sessionIds` trigger and the `meticulous.json` `testCases` list consumed by the
  legacy `addTestRun` endpoint) are now validated to exist and belong to the
  project before a run is created. A request referencing an unknown, deleted, or
  cross-project session ID is now rejected with a `400` instead of having that one
  session silently dropped — so an out-of-date `meticulous.json` session list that
  previously degraded gracefully will now fail the request until the stale IDs are
  removed. (Duplicate-session rejection applies only to the agent `--sessionIds`
  trigger; the legacy path continues to de-duplicate silently.)

### Patch Changes

- [#10521](https://github.com/alwaysmeticulous/meticulous/pull/10521) [`41ae1dd`](https://github.com/alwaysmeticulous/meticulous/commit/41ae1dd2a01114677015abfbe905192b46aea471) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous auth login` now accepts `--non-interactive`, for running without a TTY: it prints the login URL instead of opening a browser and skips the interactive project picker. This lets the OAuth flow be started in a non-interactive environment (e.g. by an agent) and completed by a human opening the printed URL on the same machine (the localhost callback still lands the token locally). When the picker is skipped, a previously-selected project is kept if it's still accessible; otherwise the command warns with guidance to pass `--project` or run `auth set-project` and exits non-zero, so scripts can detect that no project is selected. `performOAuthLogin` gains a matching `openBrowserAutomatically` option.

- [#10516](https://github.com/alwaysmeticulous/meticulous/pull/10516) [`d78f1a9`](https://github.com/alwaysmeticulous/meticulous/commit/d78f1a9f54461825700ffff970ddb0bf77c8da67) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - The OAuth token store and the `config.json` API-token lookup now resolve their directory via `getMeticulousLocalDataDir()` — honouring `METICULOUS_DIR` (and a `--dataDir` override) like every other consumer — instead of hardcoding `~/.meticulous`. The default is unchanged (`~/.meticulous`); setting `METICULOUS_DIR` now also relocates the OAuth login, selected project, and personal config.

- Updated dependencies []:
  - @alwaysmeticulous/common@2.301.0

## 2.301.0

### Minor Changes

- [#10213](https://github.com/alwaysmeticulous/meticulous/pull/10213) [`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): split custom test-run triggering into `agent upload-build` and `agent trigger-test-run`

  A build can now be registered once (`meticulous agent upload-build`, returning a `deploymentId`) and re-triggered against any base (`meticulous agent trigger-test-run --deploymentId …`), instead of the fused `ci upload-*` custom-trigger flags (now deprecated). Both agent commands wait for the run by default and print only essential output unless `--verbose` is passed; opt out of waiting with `--dontWaitForTestRunToComplete`. Adds the `uploadBuild`/`triggerTestRun` launcher helpers, the `agent*` client methods, and the `getStashCreateSha`/`getUntrackedFiles` git helpers.

  Also removes the `withUncommittedChanges` field from the deployment/test-run API surface (`@alwaysmeticulous/client`, `@alwaysmeticulous/remote-replay-launcher`, `@alwaysmeticulous/api`). It carried no behaviour the diff's presence didn't already convey — whether a run includes uncommitted changes is inferred from the uploaded git diff — so the redundant, foot-gun-prone flag is gone.

### Patch Changes

- Updated dependencies [[`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f)]:
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/api@2.301.0

## 2.300.0

### Patch Changes

- Updated dependencies [[`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740), [`48a8d66`](https://github.com/alwaysmeticulous/meticulous/commit/48a8d66d22964c2d5ec40f1899a2587458399b5d)]:
  - @alwaysmeticulous/api@2.300.0
  - @alwaysmeticulous/common@2.300.0

## 2.299.0

### Minor Changes

- [#10340](https://github.com/alwaysmeticulous/meticulous/pull/10340) [`4406b07`](https://github.com/alwaysmeticulous/meticulous/commit/4406b07d938d31583e87e80c3a7d3da658e695ce) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Improve the OAuth auth UX and add non-interactive project commands. A stored OAuth login now takes precedence over `METICULOUS_API_TOKEN` and the legacy config file, so a stale token no longer masks a fresh browser login. Adds `meticulous auth login` and `meticulous auth list-projects` plus a `--project` flag, and makes `auth whoami`/`auth logout` report and clear the active credential.

### Patch Changes

- [#10371](https://github.com/alwaysmeticulous/meticulous/pull/10371) [`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Improvements to replay downloading

- Updated dependencies [[`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c)]:
  - @alwaysmeticulous/common@2.299.0

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
