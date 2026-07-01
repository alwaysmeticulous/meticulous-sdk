# @alwaysmeticulous/cli

## 2.303.0

### Minor Changes

- [#10567](https://github.com/alwaysmeticulous/meticulous/pull/10567) [`b43046e`](https://github.com/alwaysmeticulous/meticulous/commit/b43046e23b30209c02a96d5b620c7a22289c9be6) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent trigger-test-run` no longer requires `--deploymentId` or `--commitSha`: when both are omitted, it now looks up an already-uploaded deployment for the local repo's HEAD commit. The working tree must be clean for this — unlike `agent upload-build`, a dirty tree is a hard failure rather than falling back to an ephemeral `git stash create` commit, since no deployment could ever have been uploaded for an ephemeral commit.

### Patch Changes

- Updated dependencies [[`76d9a10`](https://github.com/alwaysmeticulous/meticulous/commit/76d9a10b51cb553b3cb438893c2f5b2aaf7877bf)]:
  - @alwaysmeticulous/sdk-bundles-api@2.303.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.303.0

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

- Updated dependencies [[`132ce89`](https://github.com/alwaysmeticulous/meticulous/commit/132ce893095bc0eb89abb000ae4982f3fed85355), [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659), [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659), [`41ae1dd`](https://github.com/alwaysmeticulous/meticulous/commit/41ae1dd2a01114677015abfbe905192b46aea471), [`9a9c564`](https://github.com/alwaysmeticulous/meticulous/commit/9a9c564a7cf88da3872eb303981409eb178ef44b), [`d78f1a9`](https://github.com/alwaysmeticulous/meticulous/commit/d78f1a9f54461825700ffff970ddb0bf77c8da67)]:
  - @alwaysmeticulous/client@2.302.0
  - @alwaysmeticulous/remote-replay-launcher@2.302.0
  - @alwaysmeticulous/sdk-bundles-api@2.302.0
  - @alwaysmeticulous/debug-workspace@2.302.0
  - @alwaysmeticulous/downloading-helpers@2.302.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.302.0

## 2.301.0

### Minor Changes

- [#10213](https://github.com/alwaysmeticulous/meticulous/pull/10213) [`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): split custom test-run triggering into `agent upload-build` and `agent trigger-test-run`

  A build can now be registered once (`meticulous agent upload-build`, returning a `deploymentId`) and re-triggered against any base (`meticulous agent trigger-test-run --deploymentId …`), instead of the fused `ci upload-*` custom-trigger flags (now deprecated). Both agent commands wait for the run by default and print only essential output unless `--verbose` is passed; opt out of waiting with `--dontWaitForTestRunToComplete`. Adds the `uploadBuild`/`triggerTestRun` launcher helpers, the `agent*` client methods, and the `getStashCreateSha`/`getUntrackedFiles` git helpers.

  Also removes the `withUncommittedChanges` field from the deployment/test-run API surface (`@alwaysmeticulous/client`, `@alwaysmeticulous/remote-replay-launcher`, `@alwaysmeticulous/api`). It carried no behaviour the diff's presence didn't already convey — whether a run includes uncommitted changes is inferred from the uploaded git diff — so the redundant, foot-gun-prone flag is gone.

### Patch Changes

- Updated dependencies [[`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f), [`e4715f7`](https://github.com/alwaysmeticulous/meticulous/commit/e4715f72807ffa9e7c6c6e55b922f7b0192bfac2)]:
  - @alwaysmeticulous/remote-replay-launcher@2.301.0
  - @alwaysmeticulous/client@2.301.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/api@2.301.0
  - @alwaysmeticulous/sdk-bundles-api@2.301.0
  - @alwaysmeticulous/debug-workspace@2.301.0
  - @alwaysmeticulous/downloading-helpers@2.301.0
  - @alwaysmeticulous/record@2.301.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.301.0
  - @alwaysmeticulous/sentry@2.301.0
  - @alwaysmeticulous/tunnels-client@2.301.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.300.0

### Patch Changes

- Updated dependencies [[`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740), [`48a8d66`](https://github.com/alwaysmeticulous/meticulous/commit/48a8d66d22964c2d5ec40f1899a2587458399b5d)]:
  - @alwaysmeticulous/api@2.300.0
  - @alwaysmeticulous/common@2.300.0
  - @alwaysmeticulous/client@2.300.0
  - @alwaysmeticulous/downloading-helpers@2.300.0
  - @alwaysmeticulous/record@2.300.0
  - @alwaysmeticulous/remote-replay-launcher@2.300.0
  - @alwaysmeticulous/sdk-bundles-api@2.300.0
  - @alwaysmeticulous/debug-workspace@2.300.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.300.0
  - @alwaysmeticulous/sentry@2.300.0
  - @alwaysmeticulous/tunnels-client@2.300.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.299.0

### Minor Changes

- [#10340](https://github.com/alwaysmeticulous/meticulous/pull/10340) [`4406b07`](https://github.com/alwaysmeticulous/meticulous/commit/4406b07d938d31583e87e80c3a7d3da658e695ce) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Improve the OAuth auth UX and add non-interactive project commands. A stored OAuth login now takes precedence over `METICULOUS_API_TOKEN` and the legacy config file, so a stale token no longer masks a fresh browser login. Adds `meticulous auth login` and `meticulous auth list-projects` plus a `--project` flag, and makes `auth whoami`/`auth logout` report and clear the active credential.

### Patch Changes

- Updated dependencies [[`4406b07`](https://github.com/alwaysmeticulous/meticulous/commit/4406b07d938d31583e87e80c3a7d3da658e695ce), [`184a84e`](https://github.com/alwaysmeticulous/meticulous/commit/184a84e9128b8db17853bd5b61c9cf851148212e), [`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c)]:
  - @alwaysmeticulous/client@2.299.0
  - @alwaysmeticulous/downloading-helpers@2.299.0
  - @alwaysmeticulous/common@2.299.0
  - @alwaysmeticulous/debug-workspace@2.299.0
  - @alwaysmeticulous/remote-replay-launcher@2.299.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.299.0
  - @alwaysmeticulous/record@2.299.0
  - @alwaysmeticulous/sentry@2.299.0
  - @alwaysmeticulous/tunnels-client@2.299.0

## 2.298.1

### Patch Changes

- Updated dependencies [[`43dc613`](https://github.com/alwaysmeticulous/meticulous/commit/43dc613a33a90a6334b759336303fb3a015dee88)]:
  - @alwaysmeticulous/remote-replay-launcher@2.298.1

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

- Updated dependencies [[`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d), [`27df430`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/27df430046651864302df98d548a8a91df069521)]:
  - @alwaysmeticulous/client@2.298.0
  - @alwaysmeticulous/common@2.298.0
  - @alwaysmeticulous/debug-workspace@2.298.0
  - @alwaysmeticulous/downloading-helpers@2.298.0
  - @alwaysmeticulous/remote-replay-launcher@2.298.0
  - @alwaysmeticulous/record@2.298.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.298.0
  - @alwaysmeticulous/sentry@2.298.0
  - @alwaysmeticulous/tunnels-client@2.298.0

## 2.297.1

### Patch Changes

- Updated dependencies [[`142a03f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/142a03f40c4c535014b01c65cbf0a2ab4f4f0240)]:
  - @alwaysmeticulous/client@2.297.1
  - @alwaysmeticulous/debug-workspace@2.297.1
  - @alwaysmeticulous/downloading-helpers@2.297.1
  - @alwaysmeticulous/remote-replay-launcher@2.297.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.297.1

## 2.297.0

### Minor Changes

- [#1171](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1171) [`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55) Thanks [@sesajad](https://github.com/sesajad)! - Add support for uploading assets as incremental chunks. New `ci upload-asset-chunk` and `ci run-with-uploaded-asset-chunks` CLI commands upload each asset chunk as a compressed `tar` archive to a signed URL, skipping chunks the server already has and warning on overlapping files.

### Patch Changes

- Updated dependencies [[`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55)]:
  - @alwaysmeticulous/remote-replay-launcher@2.297.0
  - @alwaysmeticulous/client@2.297.0
  - @alwaysmeticulous/api@2.297.0
  - @alwaysmeticulous/debug-workspace@2.297.0
  - @alwaysmeticulous/downloading-helpers@2.297.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/record@2.297.0
  - @alwaysmeticulous/sdk-bundles-api@2.297.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.297.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.296.0

### Patch Changes

- Updated dependencies [[`bfee3f0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/bfee3f0e146549ecfd652e58e628a5a45fa4c0f4)]:
  - @alwaysmeticulous/client@2.296.0
  - @alwaysmeticulous/debug-workspace@2.296.0
  - @alwaysmeticulous/downloading-helpers@2.296.0
  - @alwaysmeticulous/remote-replay-launcher@2.296.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.296.0

## 2.295.1

### Patch Changes

- [#1222](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1222) [`0fc943a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0fc943a8f71e7caa317612fe16a40eb2e3217572) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Expose CDP port on record session for external agent control

- Updated dependencies [[`0fc943a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0fc943a8f71e7caa317612fe16a40eb2e3217572)]:
  - @alwaysmeticulous/record@2.295.1

## 2.295.0

### Patch Changes

- Updated dependencies [[`85cde31`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/85cde31621286698f37e29a94d089557daf3ce93), [`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0)]:
  - @alwaysmeticulous/sdk-bundles-api@2.295.0
  - @alwaysmeticulous/api@2.295.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.295.0
  - @alwaysmeticulous/client@2.295.0
  - @alwaysmeticulous/downloading-helpers@2.295.0
  - @alwaysmeticulous/record@2.295.0
  - @alwaysmeticulous/remote-replay-launcher@2.295.0
  - @alwaysmeticulous/debug-workspace@2.295.0

## 2.294.0

### Patch Changes

- Updated dependencies [[`b0cc565`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b0cc56553437bfe3ae2ba52c1187af61906b2548), [`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb)]:
  - @alwaysmeticulous/sdk-bundles-api@2.294.0
  - @alwaysmeticulous/api@2.294.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.294.0
  - @alwaysmeticulous/client@2.294.0
  - @alwaysmeticulous/downloading-helpers@2.294.0
  - @alwaysmeticulous/record@2.294.0
  - @alwaysmeticulous/remote-replay-launcher@2.294.0
  - @alwaysmeticulous/debug-workspace@2.294.0

## 2.293.1

### Patch Changes

- Updated dependencies [[`fd3f997`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/fd3f997d816df92aba010834e1da79383dbb62a9)]:
  - @alwaysmeticulous/client@2.293.1
  - @alwaysmeticulous/debug-workspace@2.293.1
  - @alwaysmeticulous/downloading-helpers@2.293.1
  - @alwaysmeticulous/remote-replay-launcher@2.293.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.293.1

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

### Patch Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

- Updated dependencies [[`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4), [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4)]:
  - @alwaysmeticulous/client@2.293.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.293.0
  - @alwaysmeticulous/remote-replay-launcher@2.293.0
  - @alwaysmeticulous/downloading-helpers@2.293.0
  - @alwaysmeticulous/debug-workspace@2.293.0
  - @alwaysmeticulous/sdk-bundles-api@2.293.0
  - @alwaysmeticulous/tunnels-client@2.293.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/record@2.293.0
  - @alwaysmeticulous/sentry@2.293.0
  - @alwaysmeticulous/api@2.293.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.292.1

### Patch Changes

- Updated dependencies [[`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f)]:
  - @alwaysmeticulous/api@2.292.1
  - @alwaysmeticulous/client@2.292.1
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/downloading-helpers@2.292.1
  - @alwaysmeticulous/record@2.292.1
  - @alwaysmeticulous/remote-replay-launcher@2.292.1
  - @alwaysmeticulous/sdk-bundles-api@2.292.1
  - @alwaysmeticulous/debug-workspace@2.292.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.292.1
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.292.0

### Patch Changes

- Updated dependencies [[`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec), [`c99a4bb`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c99a4bb037128e0ed93622045438ebd7cd5fdfa5)]:
  - @alwaysmeticulous/api@2.292.0
  - @alwaysmeticulous/sdk-bundles-api@2.292.0
  - @alwaysmeticulous/client@2.292.0
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/downloading-helpers@2.292.0
  - @alwaysmeticulous/record@2.292.0
  - @alwaysmeticulous/remote-replay-launcher@2.292.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.292.0
  - @alwaysmeticulous/debug-workspace@2.292.0

## 2.291.2

### Patch Changes

- Updated dependencies [[`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b)]:
  - @alwaysmeticulous/sdk-bundles-api@2.291.2
  - @alwaysmeticulous/api@2.291.2
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.291.2
  - @alwaysmeticulous/client@2.291.2
  - @alwaysmeticulous/downloading-helpers@2.291.2
  - @alwaysmeticulous/record@2.291.2
  - @alwaysmeticulous/remote-replay-launcher@2.291.2
  - @alwaysmeticulous/debug-workspace@2.291.2

## 2.291.1

### Patch Changes

- Updated dependencies [[`dcda697`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/dcda69796a14164f6bf6d5cd3cd52d889d9881cd)]:
  - @alwaysmeticulous/record@2.291.1

## 2.291.0

### Minor Changes

- [#1206](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1206) [`a3fc01f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a3fc01fdb82cbe659c1e0969b4ab7a4d237fa04b) Thanks [@Genora51](https://github.com/Genora51)! - Inject worker network recorder into web workers when recording via CLI

### Patch Changes

- Updated dependencies [[`a3fc01f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a3fc01fdb82cbe659c1e0969b4ab7a4d237fa04b)]:
  - @alwaysmeticulous/client@2.291.0
  - @alwaysmeticulous/record@2.291.0
  - @alwaysmeticulous/debug-workspace@2.291.0
  - @alwaysmeticulous/downloading-helpers@2.291.0
  - @alwaysmeticulous/remote-replay-launcher@2.291.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.291.0

## 2.290.3

### Patch Changes

- Updated dependencies [[`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557)]:
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.290.3
  - @alwaysmeticulous/debug-workspace@2.290.3
  - @alwaysmeticulous/downloading-helpers@2.290.3
  - @alwaysmeticulous/record@2.290.3
  - @alwaysmeticulous/remote-replay-launcher@2.290.3
  - @alwaysmeticulous/replay-orchestrator-launcher@2.290.3
  - @alwaysmeticulous/sentry@2.290.3
  - @alwaysmeticulous/tunnels-client@2.290.3

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2
  - @alwaysmeticulous/client@2.290.2
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.290.2
  - @alwaysmeticulous/record@2.290.2
  - @alwaysmeticulous/remote-replay-launcher@2.290.2
  - @alwaysmeticulous/sdk-bundles-api@2.290.2
  - @alwaysmeticulous/debug-workspace@2.290.2
  - @alwaysmeticulous/replay-orchestrator-launcher@2.290.2
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.290.0

### Minor Changes

- [#1195](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1195) [`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919) Thanks [@phreppo](https://github.com/phreppo)! - Add the `@alwaysmeticulous/custom-checks` package for writing custom check scripts: `findTestRunByCommitAndWaitForCompletion` / `findTestRunByIdAndWaitForCompletion`, `getSnapshotsFromTestRun`, and `reportCustomCheckResults`. The custom-check helpers (and `getSnapshotsFromTestRun`) move out of `@alwaysmeticulous/client` into this package, and the deprecated `plugins` CLI command is removed.

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0
  - @alwaysmeticulous/client@2.290.0
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.290.0
  - @alwaysmeticulous/record@2.290.0
  - @alwaysmeticulous/remote-replay-launcher@2.290.0
  - @alwaysmeticulous/sdk-bundles-api@2.290.0
  - @alwaysmeticulous/debug-workspace@2.290.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.290.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.289.2

### Patch Changes

- Updated dependencies [[`8731225`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/8731225adb4cf22c9d1341972583931369c17882)]:
  - @alwaysmeticulous/client@2.289.2
  - @alwaysmeticulous/debug-workspace@2.289.2
  - @alwaysmeticulous/downloading-helpers@2.289.2
  - @alwaysmeticulous/remote-replay-launcher@2.289.2
  - @alwaysmeticulous/replay-orchestrator-launcher@2.289.2

## 2.289.1

### Patch Changes

- [#1192](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1192) [`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef) Thanks [@phreppo](https://github.com/phreppo)! - Custom check execution errors are now reported for the run as a whole rather than per check: `CustomCheckVerdict` no longer includes `execution-error` (a verdict is only `pass | warn | fail`). A check that fails to run is surfaced as a run-level execution error instead of a per-check verdict.

- Updated dependencies [[`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef)]:
  - @alwaysmeticulous/api@2.289.1
  - @alwaysmeticulous/client@2.289.1
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.289.1
  - @alwaysmeticulous/record@2.289.1
  - @alwaysmeticulous/remote-replay-launcher@2.289.1
  - @alwaysmeticulous/sdk-bundles-api@2.289.1
  - @alwaysmeticulous/debug-workspace@2.289.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.289.1
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.289.0

### Patch Changes

- Updated dependencies [[`966e0b0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/966e0b0e110442a552aa0937c0570db7defd38a8), [`e7c39ab`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/e7c39abba7700fc3fb835e96602bb088498a3e81), [`3052822`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/3052822a4684a866f4feba10129757839c0ce844)]:
  - @alwaysmeticulous/client@2.289.0
  - @alwaysmeticulous/debug-workspace@2.289.0
  - @alwaysmeticulous/downloading-helpers@2.289.0
  - @alwaysmeticulous/remote-replay-launcher@2.289.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.289.0

## 2.288.2

### Patch Changes

- [#1185](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1185) [`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323) Thanks [@phreppo](https://github.com/phreppo)! - Add support for authoring and locally running custom check plugins: custom check authoring types in `@alwaysmeticulous/api`, a `getSnapshotsFromTestRun` client API, and a `meticulous plugins execute-custom-check-locally` CLI command that runs a custom check plugin against the snapshots of a test run.

- Updated dependencies [[`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323)]:
  - @alwaysmeticulous/api@2.288.2
  - @alwaysmeticulous/client@2.288.2
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.288.2
  - @alwaysmeticulous/record@2.288.2
  - @alwaysmeticulous/remote-replay-launcher@2.288.2
  - @alwaysmeticulous/sdk-bundles-api@2.288.2
  - @alwaysmeticulous/debug-workspace@2.288.2
  - @alwaysmeticulous/replay-orchestrator-launcher@2.288.2
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.288.1

### Patch Changes

- Updated dependencies [[`4e97f21`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/4e97f216670021a925f8beac64657985180a6edc)]:
  - @alwaysmeticulous/downloading-helpers@2.288.1
  - @alwaysmeticulous/client@2.288.1
  - @alwaysmeticulous/debug-workspace@2.288.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.288.1
  - @alwaysmeticulous/remote-replay-launcher@2.288.1

## 2.288.0

### Patch Changes

- Updated dependencies [[`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b)]:
  - @alwaysmeticulous/api@2.288.0
  - @alwaysmeticulous/client@2.288.0
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.288.0
  - @alwaysmeticulous/record@2.288.0
  - @alwaysmeticulous/remote-replay-launcher@2.288.0
  - @alwaysmeticulous/sdk-bundles-api@2.288.0
  - @alwaysmeticulous/debug-workspace@2.288.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.288.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.287.2

### Patch Changes

- Updated dependencies [[`3020c53`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/3020c53115e1bc39d89dab43f7f440d0b782a047)]:
  - @alwaysmeticulous/record@2.287.2

## 2.287.1

### Patch Changes

- [#1176](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1176) [`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7) Thanks [@Genora51](https://github.com/Genora51)! - Auto-detect BitBucket SHAs

- Updated dependencies [[`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7)]:
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/client@2.287.1
  - @alwaysmeticulous/debug-workspace@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.287.1
  - @alwaysmeticulous/record@2.287.1
  - @alwaysmeticulous/remote-replay-launcher@2.287.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.287.1
  - @alwaysmeticulous/sentry@2.287.1
  - @alwaysmeticulous/tunnels-client@2.287.1

## 2.287.0

### Patch Changes

- Updated dependencies [[`64c6ddf`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/64c6ddf344dad3faff6841e1582f10f5f8a9fe50), [`17dc189`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/17dc189dbe222d15a08cd9b52dffe60c819a8d15), [`0716b8f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0716b8f47b220d306b12baba896bdb8d4c1db073)]:
  - @alwaysmeticulous/sdk-bundles-api@2.287.0
  - @alwaysmeticulous/debug-workspace@2.287.0
  - @alwaysmeticulous/downloading-helpers@2.287.0
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.287.0

## 2.286.0

### Patch Changes

- Updated dependencies [[`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963)]:
  - @alwaysmeticulous/api@2.286.0
  - @alwaysmeticulous/client@2.286.0
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/downloading-helpers@2.286.0
  - @alwaysmeticulous/record@2.286.0
  - @alwaysmeticulous/remote-replay-launcher@2.286.0
  - @alwaysmeticulous/sdk-bundles-api@2.286.0
  - @alwaysmeticulous/debug-workspace@2.286.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.286.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.285.2

### Patch Changes

- Updated dependencies [[`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71)]:
  - @alwaysmeticulous/api@2.285.2
  - @alwaysmeticulous/client@2.285.2
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/downloading-helpers@2.285.2
  - @alwaysmeticulous/record@2.285.2
  - @alwaysmeticulous/remote-replay-launcher@2.285.2
  - @alwaysmeticulous/sdk-bundles-api@2.285.2
  - @alwaysmeticulous/debug-workspace@2.285.2
  - @alwaysmeticulous/replay-orchestrator-launcher@2.285.2
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.285.1

### Patch Changes

- Updated dependencies [[`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe)]:
  - @alwaysmeticulous/api@2.285.1
  - @alwaysmeticulous/client@2.285.1
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/downloading-helpers@2.285.1
  - @alwaysmeticulous/record@2.285.1
  - @alwaysmeticulous/remote-replay-launcher@2.285.1
  - @alwaysmeticulous/sdk-bundles-api@2.285.1
  - @alwaysmeticulous/debug-workspace@2.285.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.285.1
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.285.0

### Patch Changes

- Updated dependencies [[`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03)]:
  - @alwaysmeticulous/api@2.285.0
  - @alwaysmeticulous/client@2.285.0
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/downloading-helpers@2.285.0
  - @alwaysmeticulous/record@2.285.0
  - @alwaysmeticulous/remote-replay-launcher@2.285.0
  - @alwaysmeticulous/sdk-bundles-api@2.285.0
  - @alwaysmeticulous/debug-workspace@2.285.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.285.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.284.0

### Minor Changes

- [#1144](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1144) [`60154f4`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/60154f4e5a901423bf28e3deb37f5a6164d83ad3) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - cli: route all commands through unified OAuth-aware auth flow

### Patch Changes

- Updated dependencies [[`60154f4`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/60154f4e5a901423bf28e3deb37f5a6164d83ad3)]:
  - @alwaysmeticulous/client@2.284.0
  - @alwaysmeticulous/debug-workspace@2.284.0
  - @alwaysmeticulous/downloading-helpers@2.284.0
  - @alwaysmeticulous/remote-replay-launcher@2.284.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.284.0

## 2.283.2

### Patch Changes

- Updated dependencies [[`f3d6a9a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f3d6a9a15fe058614ee1ad9be13ec3c18165e874)]:
  - @alwaysmeticulous/sentry@2.283.2

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability

- Updated dependencies [[`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0)]:
  - @alwaysmeticulous/replay-orchestrator-launcher@2.283.1
  - @alwaysmeticulous/remote-replay-launcher@2.283.1
  - @alwaysmeticulous/downloading-helpers@2.283.1
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/debug-workspace@2.283.1
  - @alwaysmeticulous/sdk-bundles-api@2.283.1
  - @alwaysmeticulous/tunnels-client@2.283.1
  - @alwaysmeticulous/client@2.283.1
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/record@2.283.1
  - @alwaysmeticulous/sentry@2.283.1
  - @alwaysmeticulous/api@2.283.1

## 2.283.0

### Minor Changes

- [#1147](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1147) [`12511ae`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/12511aed67975eb8771e2d4e79bdcf435aad4399) Thanks [@linpengzhang](https://github.com/linpengzhang)! - `ci upload-assets` and `ci upload-container`: `--waitForTestRunToComplete` is only allowed when Meticulous is run from a local branch checkout—pass `--repoDirectory`, or both `--baseSha` and `--gitDiffOutput`. Invocations that only pass `--commitSha` must omit the wait flag (previously they could pass validation and then block until the test run left an in-progress state).

### Patch Changes

- Updated dependencies [[`0806546`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0806546254d3e63167b7406dc1cf8483a06c4003), [`d0641e5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d0641e50d615ad917d1e1963fd6f5466e741ebc0), [`ae0f8ce`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/ae0f8cef9af0025abdd41a46427a5956b84d7964)]:
  - @alwaysmeticulous/debug-workspace@2.283.0
  - @alwaysmeticulous/client@2.283.0
  - @alwaysmeticulous/downloading-helpers@2.283.0
  - @alwaysmeticulous/remote-replay-launcher@2.283.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.283.0

## 2.282.0

### Minor Changes

- [#1141](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1141) [`670d0de`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/670d0de43e29329e403880c74b22eefb7c2cc879) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - debug-workspace: lean down agent workspaces and conditional CLAUDE.md

### Patch Changes

- Updated dependencies [[`670d0de`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/670d0de43e29329e403880c74b22eefb7c2cc879)]:
  - @alwaysmeticulous/downloading-helpers@2.282.0
  - @alwaysmeticulous/debug-workspace@2.282.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.282.0

## 2.281.0

### Patch Changes

- Updated dependencies [[`f6f780e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f6f780ebd294643d3d0f659187af4b4e624477aa)]:
  - @alwaysmeticulous/debug-workspace@2.281.0
  - @alwaysmeticulous/client@2.281.0
  - @alwaysmeticulous/downloading-helpers@2.281.0
  - @alwaysmeticulous/remote-replay-launcher@2.281.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.281.0

## 2.280.1

### Patch Changes

- [#1135](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1135) [`22e3673`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/22e367398ee6ddcba1de4f5da963e0711ea4d5fa) Thanks [@Genora51](https://github.com/Genora51)! - Add --onlyReplaySessionsInTestsFile to ci run-local
