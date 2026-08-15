# @alwaysmeticulous/api

## 2.326.0

### Minor Changes

- [#12286](https://github.com/alwaysmeticulous/meticulous/pull/12286) [`bc5e33d`](https://github.com/alwaysmeticulous/meticulous/commit/bc5e33df47f22fc88fe956b4c1202163dc4fa813) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Removed the `pathsToIncludeInCoverage` project setting from `Project["settings"]`. The setting has had no effect since server-side `.meticulousignore` support replaced it: nothing read it, so anything still setting it was silently a no-op. Scope coverage with `pathsToExcludeFromCoverage` or a repository-root `.meticulousignore` / `.meticulousignore.{slug}` instead. To restrict coverage to one subtree, either exclude the other trees or un-ignore each ancestor after a blanket `**` (e.g. `**`, `!apps/`, `!apps/web/`, `!apps/web/src/`, `!apps/web/src/**`) — a nested negation alone will not re-include files whose parent is still excluded.

- [#12212](https://github.com/alwaysmeticulous/meticulous/pull/12212) [`bca9805`](https://github.com/alwaysmeticulous/meticulous/commit/bca980587b44e428c9a4f5c3e84b9af1ee9041c7) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `TestRun.configData` and `getTestRunForCommit`'s response now expose whether a run is a lazy session-pool base — which can settle into `Success`/`Failure` without ever passing through `Partial`. `meticulous agent test-run-diffs`, `test-run-check`, and `js-coverage --prDiffOnly` now reject any session-pool run client-side, matching the backend's rejection for these commands (previously the CLI's own pre-check only caught one still `Partial`; a session-pool run that had settled still reached the server and was correctly rejected there, just via a round trip instead of instantly). This includes a session-pool run that also triggered eager session selection on a main-branch push — its diffs/checks/PR-diff-scoped coverage are not reachable through these three commands even though it represents a change of its own; plain (non-`prDiffOnly`) `js-coverage` is unaffected and continues to serve any session-pool run's coverage normally.

## 2.324.0

### Patch Changes

- [#11983](https://github.com/alwaysmeticulous/meticulous/pull/11983) [`297a0f5`](https://github.com/alwaysmeticulous/meticulous/commit/297a0f57c2acbb26e48c8f346b463f240212941f) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add `html_template_sibling_coverage` to `SessionRelevanceReason`, recording that a session was selected because its coverage-source replay covered the co-located sibling source file of a changed HTML template (e.g. `foo.component.ts` for `foo.component.html`), rather than covering a directly edited line.

- [#11877](https://github.com/alwaysmeticulous/meticulous/pull/11877) [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `TestRunDataLocations.coveragePr` and `coverageStatsPr` are now optional: the `GET test-runs/:id/data` endpoint omits the PR-scoped coverage artifact URLs for callers without code-data access.

## 2.323.0

### Minor Changes

- [#11653](https://github.com/alwaysmeticulous/meticulous/pull/11653) [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add a terminal `Skipped` test run status for runs that deliberately do not execute (e.g. when no base test run is available). The client sends a `clientVersion` on `getTestRun` so the backend can return `Skipped` to new clients and downgrade it to `Aborted` for pinned older CLIs.

## 2.321.0

### Minor Changes

- [#11593](https://github.com/alwaysmeticulous/meticulous/pull/11593) [`3529e08`](https://github.com/alwaysmeticulous/meticulous/commit/3529e081dc13602a463e3d47c64b674316777722) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add optional `coverageReplaysByFileV2` to `TestRunDataLocations` for the
  `coverage-replays-by-file.v2.json.gz` artifact. It carries the same
  line-level simulation index as `coverageReplaysByFile`, but replay sets store
  indices into a shared `replayIds` dictionary so the artifact stays small
  enough for the browser to materialize on large projects.

## 2.319.0

### Minor Changes

- [#11533](https://github.com/alwaysmeticulous/meticulous/pull/11533) [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b) Thanks [@dennysem](https://github.com/dennysem)! - Add replay support to the workerd shim. `withMeticulous` now also serves recorded responses
  to the app's outgoing `fetch` calls instead of letting them reach the real service, and
  freezes the worker's clock at the recorded session's end so credentials minted during the
  recording are still valid.

  Replay activates on the `x-meticulous-backend-replay-sidecar-url` header, injected by the
  Meticulous replay runner — workerd cannot read container environment variables, so per-replay
  config has to arrive per request. The shim validates the value and only honours a plain
  `http:` origin on a loopback, docker-gateway or RFC1918 host — link-local is rejected, so a
  forged header cannot steer replay traffic at a cloud metadata endpoint. Replay takes
  precedence over recording when both are configured. With neither, the wrapper remains a
  complete pass-through.

  Calls through a Cloudflare binding (`env.SVC.fetch(...)`) are recorded but not yet replayed:
  they are captured as their own technology (`workerd-binding`), which the mock store does not
  serve, so during a replay they reach the real binding. Only `globalThis.fetch` is mocked.

  `@alwaysmeticulous/api` gains `SerializedBackendSpan.clientTechnology` and the
  `WORKERD_FETCH_CLIENT_TECHNOLOGY` constant, so a replay can tell a workerd recording from a
  Node one and only start the out-of-process mock store for the former.

### Patch Changes

- [#11566](https://github.com/alwaysmeticulous/meticulous/pull/11566) [`46fce61`](https://github.com/alwaysmeticulous/meticulous/commit/46fce6165d356e006bd432c16c194034cce4b7c9) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add the optional `relevanceReason` to `TestCase`, recording why a session carries the `relevanceToPR` it does (direct coverage, a mark-all MaybeRelevant signal, no coverage, and so on). Relevant Session Execution snapshots it alongside the relevance so the mix of sessions actually replayed can be reported directly rather than derived from the MaybeRelevant sampling percentage. Older test runs simply omit it.

## 2.312.0

### Minor Changes

- [#11193](https://github.com/alwaysmeticulous/meticulous/pull/11193) [`2b3c422`](https://github.com/alwaysmeticulous/meticulous/commit/2b3c422c47804ec7adfa79b4375c6bda7887c73c) Thanks [@phreppo](https://github.com/phreppo)! - Add `coverageScreenshotReplaysByFilePr` to `TestRunDataLocations`: the PR-scoped `coverage-screenshots-by-file.pr.json.gz` artifact, filtered to PR-edited files, so PR coverage surfaces can avoid downloading the full codebase-sized screenshots-by-file artifact.

## 2.310.0

### Minor Changes

- [#11104](https://github.com/alwaysmeticulous/meticulous/pull/11104) [`b22d975`](https://github.com/alwaysmeticulous/meticulous/commit/b22d9752538e6efdbfe74a14c002e61764c9fb0e) Thanks [@phreppo](https://github.com/phreppo)! - Add optional `coverageReplaysByFilePr` location to `TestRunDataLocations` for the new PR-scoped `coverage-replays-by-file.pr.json.gz` test run artifact.

## 2.307.0

### Minor Changes

- [#10897](https://github.com/alwaysmeticulous/meticulous/pull/10897) [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add optional `responseStartOffsetMs` to `StreamingFetchResponseData` and `StreamingXhrResponseData`, recording the time between the request being sent and the response headers being received. Replay uses this to deliver streamed chunks at the recorded time instead of anchoring them to the HAR entry time (which for streaming responses reflects the streaming detection timeout, ~5s after the response actually started).

### Patch Changes

- [#10666](https://github.com/alwaysmeticulous/meticulous/pull/10666) [`55d7f95`](https://github.com/alwaysmeticulous/meticulous/commit/55d7f95265d434d2d01eae40589e7307f9110492) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Re-export `ScreenshotDiffResultFlake` from the package index, so consumers no longer need to import it via the internal `/dist` path.

## 2.306.0

### Minor Changes

- [#10727](https://github.com/alwaysmeticulous/meticulous/pull/10727) [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd) Thanks [@phreppo](https://github.com/phreppo)! - Add a `--sessionFilter` option to `ci run-with-uploaded-asset-chunks` that restricts the triggered test run to sessions whose start URL matches at least one of the provided RE2 regexes.

## 2.301.0

### Patch Changes

- [#10213](https://github.com/alwaysmeticulous/meticulous/pull/10213) [`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): split custom test-run triggering into `agent upload-build` and `agent trigger-test-run`

  A build can now be registered once (`meticulous agent upload-build`, returning a `deploymentId`) and re-triggered against any base (`meticulous agent trigger-test-run --deploymentId …`), instead of the fused `ci upload-*` custom-trigger flags (now deprecated). Both agent commands wait for the run by default and print only essential output unless `--verbose` is passed; opt out of waiting with `--dontWaitForTestRunToComplete`. Adds the `uploadBuild`/`triggerTestRun` launcher helpers, the `agent*` client methods, and the `getStashCreateSha`/`getUntrackedFiles` git helpers.

  Also removes the `withUncommittedChanges` field from the deployment/test-run API surface (`@alwaysmeticulous/client`, `@alwaysmeticulous/remote-replay-launcher`, `@alwaysmeticulous/api`). It carried no behaviour the diff's presence didn't already convey — whether a run includes uncommitted changes is inferred from the uploaded git diff — so the redundant, foot-gun-prone flag is gone.

## 2.300.0

### Minor Changes

- [#10377](https://github.com/alwaysmeticulous/meticulous/pull/10377) [`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740) Thanks [@phreppo](https://github.com/phreppo)! - Add `sessionDescription` to custom-check snapshots. Each `Snapshot` now carries the session's short, human-readable description (what the user was doing in the session), or `null` when the session has no description. It is populated at replay time from data already in memory, so custom checks can label sessions in their reports without an extra lookup.

### Patch Changes

- [#10375](https://github.com/alwaysmeticulous/meticulous/pull/10375) [`48a8d66`](https://github.com/alwaysmeticulous/meticulous/commit/48a8d66d22964c2d5ec40f1899a2587458399b5d) Thanks [@narobertson42](https://github.com/narobertson42)! - Record the IndexedDB database schema version (`IDBDatabase.version`) at snapshot time via a new optional `version` field on `IDBObjectStoreSnapshot`. It is captured for every snapshotted store so that replay seeding can re-open each database at the version the application expects, avoiding "blocked by another connection" upgrade errors during replay.

## 2.297.0

### Minor Changes

- [#1171](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1171) [`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55) Thanks [@sesajad](https://github.com/sesajad)! - Add support for uploading assets as incremental chunks. New `ci upload-asset-chunk` and `ci run-with-uploaded-asset-chunks` CLI commands upload each asset chunk as a compressed `tar` archive to a signed URL, skipping chunks the server already has and warning on overlapping files.

## 2.295.0

### Patch Changes

- [#1226](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1226) [`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add typings for different screenshot sizes

## 2.294.0

### Minor Changes

- [#1211](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1211) [`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb) Thanks [@phreppo](https://github.com/phreppo)! - Rename the `CustomCheckVerdict` values reported by custom checks: `warn` → `warn-without-requiring-user-ack` and `fail` → `warn-and-require-user-ack` (`pass` is unchanged). The two warning verdicts now make the distinction explicit: `warn-and-require-user-ack` surfaces a report the user is asked to acknowledge (review), while `warn-without-requiring-user-ack` is informational only.

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

## 2.292.1

### Patch Changes

- [#1217](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1217) [`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f) Thanks [@phreppo](https://github.com/phreppo)! - Report custom check results against the effective (merged) test run after network patching (session repair). When network patching is enabled, completing the original test run triggers a hidden patching run that is merged into a separate run, and that merged run is the one surfaced in the Meticulous UI. `findTestRunByIdAndWaitForCompletion` now resolves and returns this effective merged run once patching settles, falling back to the original run on older backends (404), transient errors, or timeout. Adds the `TestRunNetworkPatchingResult` type to `@alwaysmeticulous/api` and the `getTestRunNetworkPatchingResult` client API.

## 2.292.0

### Minor Changes

- [#1214](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1214) [`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `ElementRedactionMode` and an optional `redactionMode` field on `CSSSelectorToIgnore`, letting each ignored element choose in which contexts it is hidden: `"always"`, `"replay-and-diff"` (default), or `"diff-only"`.

## 2.291.2

### Patch Changes

- [#1207](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1207) [`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b) Thanks [@phreppo](https://github.com/phreppo)! - Add the `window.Meticulous.replay.recordCustomSnapshot(...)` custom-snapshot API to the public replay window API, alongside `addOnBeforeScreenshotListener` and `addOnReplayCompletionListener`. This lets customers inject JavaScript into their application to instruct the Meticulous replay engine to snapshot arbitrary JSON-serializable data (e.g. an accessibility report or performance metrics) at replay time. Snapshots are auto-tagged with the stage during the session (the next screenshot taken) and persisted alongside the replay, so a custom check can later compare the base and head snapshots of a given type across a test run. Adds the optional `versionNumber` field to `Snapshot` so checks can detect when a snapshot's recorded format changed between base and head.

## 2.290.2

### Patch Changes

- [#1200](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1200) [`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add type for GQL-over-WS divergence

## 2.290.0

### Minor Changes

- [#1195](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1195) [`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919) Thanks [@phreppo](https://github.com/phreppo)! - Add the `@alwaysmeticulous/custom-checks` package for writing custom check scripts: `findTestRunByCommitAndWaitForCompletion` / `findTestRunByIdAndWaitForCompletion`, `getSnapshotsFromTestRun`, and `reportCustomCheckResults`. The custom-check helpers (and `getSnapshotsFromTestRun`) move out of `@alwaysmeticulous/client` into this package, and the deprecated `plugins` CLI command is removed.

## 2.289.1

### Patch Changes

- [#1192](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1192) [`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef) Thanks [@phreppo](https://github.com/phreppo)! - Custom check execution errors are now reported for the run as a whole rather than per check: `CustomCheckVerdict` no longer includes `execution-error` (a verdict is only `pass | warn | fail`). A check that fails to run is surfaced as a run-level execution error instead of a per-check verdict.

## 2.288.2

### Patch Changes

- [#1185](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1185) [`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323) Thanks [@phreppo](https://github.com/phreppo)! - Add support for authoring and locally running custom check plugins: custom check authoring types in `@alwaysmeticulous/api`, a `getSnapshotsFromTestRun` client API, and a `meticulous plugins execute-custom-check-locally` CLI command that runs a custom check plugin against the snapshots of a test run.

## 2.288.0

### Minor Changes

- [#1181](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1181) [`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b) Thanks [@dennysem](https://github.com/dennysem)! - add backendSpans to SessionData

## 2.286.0

### Minor Changes

- [#1167](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1167) [`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963) Thanks [@sesajad](https://github.com/sesajad)! - Add required `sequenceNumber` (0-indexed) to `ScreenshotAuxiliary` so multiple auxiliary screenshots sharing the same `eventNumber` and `reason` can be deterministically ordered.

## 2.285.2

### Patch Changes

- [#1165](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1165) [`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add pre-processing status

## 2.285.1

### Patch Changes

- [#1163](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1163) [`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Extend two types for compiled RSE

## 2.285.0

### Minor Changes

- [#1160](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1160) [`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03) Thanks [@sesajad](https://github.com/sesajad)! - Introducing a new experimental type of screenshot for non-event-triggered screenshots

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability
