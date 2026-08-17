# @alwaysmeticulous/cli

## 2.326.1

### Patch Changes

- Updated dependencies [[`9abb35f`](https://github.com/alwaysmeticulous/meticulous/commit/9abb35f8c7797fe9549c9642c6569c95b1bc053d)]:
  - @alwaysmeticulous/sdk-bundles-api@2.326.1
  - @alwaysmeticulous/common@2.326.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.326.1

## 2.326.0

### Minor Changes

- [#12123](https://github.com/alwaysmeticulous/meticulous/pull/12123) [`88d0868`](https://github.com/alwaysmeticulous/meticulous/commit/88d086862afbf39bb24f798566ca67981220b12b) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent test-run-check` (MCP: `get_test_run_check`) now caps how much of a report it returns inline. A report over the cap returns a short notice plus a `url` to download the full report, instead of the full text — the CLI prints the notice and the URL on the plain-text path, and both are available as `text`/`url` with `--json`.

- [#12212](https://github.com/alwaysmeticulous/meticulous/pull/12212) [`bca9805`](https://github.com/alwaysmeticulous/meticulous/commit/bca980587b44e428c9a4f5c3e84b9af1ee9041c7) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `TestRun.configData` and `getTestRunForCommit`'s response now expose whether a run is a lazy session-pool base — which can settle into `Success`/`Failure` without ever passing through `Partial`. `meticulous agent test-run-diffs`, `test-run-check`, and `js-coverage --prDiffOnly` now reject any session-pool run client-side, matching the backend's rejection for these commands (previously the CLI's own pre-check only caught one still `Partial`; a session-pool run that had settled still reached the server and was correctly rejected there, just via a round trip instead of instantly). This includes a session-pool run that also triggered eager session selection on a main-branch push — its diffs/checks/PR-diff-scoped coverage are not reachable through these three commands even though it represents a change of its own; plain (non-`prDiffOnly`) `js-coverage` is unaffected and continues to serve any session-pool run's coverage normally.

- [#12064](https://github.com/alwaysmeticulous/meticulous/pull/12064) [`abd232d`](https://github.com/alwaysmeticulous/meticulous/commit/abd232db2372fa03babc4cda95f683256e116053) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent test-run-checks` is renamed to `meticulous agent test-run-check` (MCP: `get_test_run_check`), since it operates on a single check; the client's exported `getTestRunCheckReport` is unaffected but the CLI command name changed. The new `--availableIds` flag on `test-run-check` (MCP: `get_test_run_check_available_ids`) lists the check IDs that have reported results for a test run, exposed on the client as `getTestRunCheckAvailableIds`.

### Patch Changes

- [#12186](https://github.com/alwaysmeticulous/meticulous/pull/12186) [`cbb227c`](https://github.com/alwaysmeticulous/meticulous/commit/cbb227c3fe7df7fa4d01f02b4b425fb012c1b62b) Thanks [@sesajad](https://github.com/sesajad)! - Allow configured agentic staging logins to receive a CI-supplied TOTP secret.

- Updated dependencies [[`00066d3`](https://github.com/alwaysmeticulous/meticulous/commit/00066d3f830390c2df1227044bc172789abba7da), [`e369a5a`](https://github.com/alwaysmeticulous/meticulous/commit/e369a5af5f90fca48bdfdd7adecc7908bd7472d3), [`d4b5a1e`](https://github.com/alwaysmeticulous/meticulous/commit/d4b5a1e52e37e5ff6e20a7dba7f6894285ce7f3b), [`84feae7`](https://github.com/alwaysmeticulous/meticulous/commit/84feae7f6b335a4445206b6c17a7168cbbcfded2), [`04c8bc7`](https://github.com/alwaysmeticulous/meticulous/commit/04c8bc7258c2ea2055651e029b6ee5d762d87a0b), [`c810f6f`](https://github.com/alwaysmeticulous/meticulous/commit/c810f6f58ae213f9d3d878f3f9f9c2bcfa9b94a5), [`f1c9afa`](https://github.com/alwaysmeticulous/meticulous/commit/f1c9afaf7d88f35487ed7e625dccebc930a90ee2), [`bd0c7bc`](https://github.com/alwaysmeticulous/meticulous/commit/bd0c7bce2a04ce4294eb59f2859ddb3de27ce714), [`52df6fa`](https://github.com/alwaysmeticulous/meticulous/commit/52df6fa26dda3cc9e52726a4a41eaf51935f2ed9), [`88d0868`](https://github.com/alwaysmeticulous/meticulous/commit/88d086862afbf39bb24f798566ca67981220b12b), [`f1c9afa`](https://github.com/alwaysmeticulous/meticulous/commit/f1c9afaf7d88f35487ed7e625dccebc930a90ee2), [`e31cd70`](https://github.com/alwaysmeticulous/meticulous/commit/e31cd700185109bf0591167fa0a28c7dfda25742), [`ac2e48b`](https://github.com/alwaysmeticulous/meticulous/commit/ac2e48b1b28f3c3fa361d31e4aaa3582ffb96055), [`db593ac`](https://github.com/alwaysmeticulous/meticulous/commit/db593ac7b7f359d6440cc3a9cd33ff48c7555155), [`e64edef`](https://github.com/alwaysmeticulous/meticulous/commit/e64edef217b5f6738728fc5119e710a21e354958), [`bc5e33d`](https://github.com/alwaysmeticulous/meticulous/commit/bc5e33df47f22fc88fe956b4c1202163dc4fa813), [`bca9805`](https://github.com/alwaysmeticulous/meticulous/commit/bca980587b44e428c9a4f5c3e84b9af1ee9041c7), [`654b4c5`](https://github.com/alwaysmeticulous/meticulous/commit/654b4c5bfac3bd4c94c63eaecf804b1231980c97), [`abd232d`](https://github.com/alwaysmeticulous/meticulous/commit/abd232db2372fa03babc4cda95f683256e116053), [`cbb227c`](https://github.com/alwaysmeticulous/meticulous/commit/cbb227c3fe7df7fa4d01f02b4b425fb012c1b62b)]:
  - @alwaysmeticulous/client@2.326.0
  - @alwaysmeticulous/common@2.326.0
  - @alwaysmeticulous/remote-replay-launcher@2.326.0
  - @alwaysmeticulous/sdk-bundles-api@2.326.0
  - @alwaysmeticulous/downloading-helpers@2.326.0
  - @alwaysmeticulous/api@2.326.0
  - @alwaysmeticulous/debug-workspace@2.326.0
  - @alwaysmeticulous/record@2.326.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.326.0
  - @alwaysmeticulous/sentry@2.326.0
  - @alwaysmeticulous/tunnels-client@2.326.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/session-filters@2.326.0

## 2.325.0

### Minor Changes

- [#11992](https://github.com/alwaysmeticulous/meticulous/pull/11992) [`9944e6b`](https://github.com/alwaysmeticulous/meticulous/commit/9944e6b493fbc23f6b8ce1158e97696fc215e669) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Agents can now reject a screenshot diff on a custom-trigger test run — one with no pull request, e.g. a CLI or agent `trigger-test-run` call — not just a pull-request run. The rejection is recorded against the test run's own ledger instead of a pull request's, with the same idempotency and comment-supersession behavior. `ignore-diff` already worked on such runs, since it only ever writes a comment.

### Patch Changes

- [#12028](https://github.com/alwaysmeticulous/meticulous/pull/12028) [`575bd1b`](https://github.com/alwaysmeticulous/meticulous/commit/575bd1be1294293df9890cfcf958697b5c819018) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent reject-diff` and `ignore-diff` now output the ID of the review comment they
  wrote, matching `create-diff-comment` — the caller can reply to the thread it just started
  instead of having to look the comment up again.

  Repeating a verdict the diff already carries still appends no second decision, but now records
  its own explanation rather than discarding it, since the reason and coordinates it was called
  with may be new.

- [#11994](https://github.com/alwaysmeticulous/meticulous/pull/11994) [`239d613`](https://github.com/alwaysmeticulous/meticulous/commit/239d6130d17fe80737e8573268eaf24883d29807) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Stop a run over an explicit set of sessions from standing in for its commit:
  - A run triggered with `--sessionIds` replays exactly those sessions, so it describes them rather than its commit. Being the newest run for that commit, it won every by-commit lookup — most damagingly in `agent js-coverage`, where a handful of sessions' coverage was reported as the commit's, and where pairing it with `--headPlusTestRunIds` unioned the run with itself and returned one run's coverage as a combined total. Such runs are now skipped whenever a commit is resolved to a run (`js-coverage`, `test-run-diffs`, `test-run-for-commit`, the MCP `get_test_run_for_commit`, …); pass the id `trigger-test-run` returns as `--testRunId` to work with one.
  - Naming the run being queried among the runs to union in (`--headPlusTestRunIds` / `--testRunIds` / `unionTestRunIds`) is now rejected rather than silently dropped: a run unioned with itself is just that run, so the response would answer a combine with a single run's coverage. Repeated ids are still collapsed silently.

- Updated dependencies [[`9944e6b`](https://github.com/alwaysmeticulous/meticulous/commit/9944e6b493fbc23f6b8ce1158e97696fc215e669), [`575bd1b`](https://github.com/alwaysmeticulous/meticulous/commit/575bd1be1294293df9890cfcf958697b5c819018), [`3837dd1`](https://github.com/alwaysmeticulous/meticulous/commit/3837dd1645cbf2c47c6fcc0cf11d907204ca9b72), [`8e26cb9`](https://github.com/alwaysmeticulous/meticulous/commit/8e26cb9de09cdd8c90db9b1c187c87fd3becf913), [`d4be3d8`](https://github.com/alwaysmeticulous/meticulous/commit/d4be3d8db101166488602da08a7f425ef3f07a1e)]:
  - @alwaysmeticulous/client@2.325.0
  - @alwaysmeticulous/sdk-bundles-api@2.325.0
  - @alwaysmeticulous/downloading-helpers@2.325.0
  - @alwaysmeticulous/remote-replay-launcher@2.325.0
  - @alwaysmeticulous/debug-workspace@2.325.0
  - @alwaysmeticulous/common@2.324.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.325.0

## 2.324.0

### Minor Changes

- [#11766](https://github.com/alwaysmeticulous/meticulous/pull/11766) [`c93b469`](https://github.com/alwaysmeticulous/meticulous/commit/c93b4698a4d77668910f140e9e69b3e53c601dbf) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Let agents reject a screenshot diff through the client, agent CLI, and MCP server. A rejection is a real rejection: it goes into the same review ledger a human rejection goes into, blocks the pull request identically, and replaces any earlier decision on the diff. It requires a review comment at approximate image coordinates explaining why, and the test run must belong to a pull request.

  `ignore-diff` records an agent's view that a diff is expected variation as a comment only — it deliberately decides nothing, since a non-blocking `ignored` would let any holder of a project write token green their own pull request. The diff stays unreviewed and the check stays pending until a human decides.

  Agents can also start and reply to comment threads independently of a decision, and `diff-comments` gains an `isAgentAuthored` attribute — the only thing distinguishing an agent's comment from a human's when there is no author name.

- [#11880](https://github.com/alwaysmeticulous/meticulous/pull/11880) [`73ee2cd`](https://github.com/alwaysmeticulous/meticulous/commit/73ee2cd3f19e577f1f054de45c838b3780ea1998) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - The diffs-summary endpoint (`getTestRunDiffsSummary` / CLI `test-run-diffs` / MCP `get_test_run_diffs`) no longer supports `retrigger` — `DiffsSummaryOptions.retrigger` is removed. `DiffsSummaryFailureReason` gains `test-run-not-ready` / `test-run-unavailable` / `computation-error` in place of the old generic `FAILED`, so a `failed` response's `reason` says why rather than just how the underlying workflow ended. A `failed` response never has a computation still running behind it, so stop polling on one; `test-run-not-ready` (the test run hadn't finished in time) is the one reason worth asking again about later.

- [#11906](https://github.com/alwaysmeticulous/meticulous/pull/11906) [`4002026`](https://github.com/alwaysmeticulous/meticulous/commit/4002026f54633115bdee622980790c66f7e2f57d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add an optional session duration (in seconds) to the agent sessions listing via `--includeDurationSeconds`. Omitted (empty in TSV) for sessions where a duration couldn't be computed, e.g. recorded before this was tracked.

- [#11891](https://github.com/alwaysmeticulous/meticulous/pull/11891) [`f51f89a`](https://github.com/alwaysmeticulous/meticulous/commit/f51f89ad7775dbee23e9d33cb26e5f0500e5c1ba) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add optional user-event and URL-visit counts to the agent sessions listing.

- [#11970](https://github.com/alwaysmeticulous/meticulous/pull/11970) [`f907b09`](https://github.com/alwaysmeticulous/meticulous/commit/f907b0921c2d11f9d11205b8dca160e163d2e99b) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Report `agent test-run-diffs` results as "16 screenshot diffs", with singulars/plurals inferred, and name the pre-selection total ("Including 5 representative screenshot diffs out of 42 total") whenever representative selection dropped diffs. The diffs summary response carries the new `numMatchingDiffs` count that total comes from.

### Patch Changes

- [#11905](https://github.com/alwaysmeticulous/meticulous/pull/11905) [`71dae8b`](https://github.com/alwaysmeticulous/meticulous/commit/71dae8b638e96c9c8f0c642f79df2c89ceb4b4ea) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Review follow-ups for the agent project-selection commands:
  - `auth get-project`/`get_project` and the empty-result hints now distinguish an auto-picked project (`source: "auto-picked"`, when nothing is stored but it's your only accessible project) from a stored default (`source: "user-default"`).
  - `auth whoami`/`whoami` now reports `authenticatedVia: "test-run-token"` for a test-run API token, distinct from `"project-api-token"`.
  - `agent js-coverage --latestForProject` and `get_project_js_coverage` now get the same "searched project" guidance on an empty result as `agent sessions`/`get_sessions` and `agent test-run-for-commit`/`get_test_run_for_commit`; the latter's empty-result guidance now also names the project on a filtered, still-empty `agent sessions`/`get_sessions` call only when no filter argument was given.
  - Fixed the CLI project-selection hint occasionally giving the opposite advice (naming the wrong credential kind) on a transient lookup failure, by resolving the selection through a single request instead of two.
  - An empty or whitespace-only `--project`/`project` argument is now treated as absent (matching the backend), instead of suppressing the empty-result hint.
  - A `404` from a route this CLI expects but an older backend doesn't have yet is no longer misreported as "project not found".

- [#11890](https://github.com/alwaysmeticulous/meticulous/pull/11890) [`daf7259`](https://github.com/alwaysmeticulous/meticulous/commit/daf72590468aee89a73dea858d003efe41385b75) Thanks [@claude](https://github.com/apps/claude)! - Bump the pinned `puppeteer-core` version from `24.14.0` to `24.42.0`, so the published packages install Chrome for Testing `147.0.7727.57` instead of `138.0.7204.157`. This matches the Chrome version already used by Meticulous's cloud replay infrastructure, keeping local recording/replay/debugging behavior consistent with cloud test runs.

- [#11905](https://github.com/alwaysmeticulous/meticulous/pull/11905) [`71dae8b`](https://github.com/alwaysmeticulous/meticulous/commit/71dae8b638e96c9c8f0c642f79df2c89ceb4b4ea) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Project-scoped commands that come back empty (`agent test-run-for-commit`, `agent sessions`, and every command that resolves a test run from a commit) now name the project they searched and how to change it, since an unexpectedly empty result is usually the wrong project rather than missing data.

  `auth get-project` and `auth set-project` gained `--json`, and `auth whoami --json` now reports the token's project under `selectedProject` (the key its OAuth output already used, and the one the matching MCP tool uses) — `pinnedProject` remains as a deprecated alias. The four `auth` commands now resolve through `agent/whoami`, `agent/projects` and `agent/project` rather than the `oauth/*` endpoints the CLI also uses internally, so each command is one request; their output is unchanged.

- [#11877](https://github.com/alwaysmeticulous/meticulous/pull/11877) [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add agent CLI and client support for retrieving builtin and custom non-visual check reports.

- Updated dependencies [[`71dae8b`](https://github.com/alwaysmeticulous/meticulous/commit/71dae8b638e96c9c8f0c642f79df2c89ceb4b4ea), [`c93b469`](https://github.com/alwaysmeticulous/meticulous/commit/c93b4698a4d77668910f140e9e69b3e53c601dbf), [`b89a9e8`](https://github.com/alwaysmeticulous/meticulous/commit/b89a9e82013b34552b044443b80e65c297f8c487), [`2f1c1cc`](https://github.com/alwaysmeticulous/meticulous/commit/2f1c1cc6dce21dd4ac39b58936ed0993e944e1f5), [`daf7259`](https://github.com/alwaysmeticulous/meticulous/commit/daf72590468aee89a73dea858d003efe41385b75), [`e9d9a7a`](https://github.com/alwaysmeticulous/meticulous/commit/e9d9a7a74abac6468e18ec347684f421ddfcab12), [`73ee2cd`](https://github.com/alwaysmeticulous/meticulous/commit/73ee2cd3f19e577f1f054de45c838b3780ea1998), [`38e5c1a`](https://github.com/alwaysmeticulous/meticulous/commit/38e5c1a36ee1c47d0adad1c92a5f7c2dd08a26d6), [`297a0f5`](https://github.com/alwaysmeticulous/meticulous/commit/297a0f57c2acbb26e48c8f346b463f240212941f), [`3d94e23`](https://github.com/alwaysmeticulous/meticulous/commit/3d94e23e750a448db9e3270db62737e8f4af9a3e), [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297), [`71dae8b`](https://github.com/alwaysmeticulous/meticulous/commit/71dae8b638e96c9c8f0c642f79df2c89ceb4b4ea), [`4002026`](https://github.com/alwaysmeticulous/meticulous/commit/4002026f54633115bdee622980790c66f7e2f57d), [`4d402a0`](https://github.com/alwaysmeticulous/meticulous/commit/4d402a0dba16ed5d9cbc1df300e2d498cd974a1b), [`f51f89a`](https://github.com/alwaysmeticulous/meticulous/commit/f51f89ad7775dbee23e9d33cb26e5f0500e5c1ba), [`38e5c1a`](https://github.com/alwaysmeticulous/meticulous/commit/38e5c1a36ee1c47d0adad1c92a5f7c2dd08a26d6), [`f907b09`](https://github.com/alwaysmeticulous/meticulous/commit/f907b0921c2d11f9d11205b8dca160e163d2e99b), [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297)]:
  - @alwaysmeticulous/client@2.324.0
  - @alwaysmeticulous/common@2.324.0
  - @alwaysmeticulous/record@2.324.0
  - @alwaysmeticulous/sdk-bundles-api@2.324.0
  - @alwaysmeticulous/api@2.324.0
  - @alwaysmeticulous/session-filters@2.324.0
  - @alwaysmeticulous/debug-workspace@2.324.0
  - @alwaysmeticulous/downloading-helpers@2.324.0
  - @alwaysmeticulous/remote-replay-launcher@2.324.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.324.0
  - @alwaysmeticulous/sentry@2.324.0
  - @alwaysmeticulous/tunnels-client@2.324.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.323.0

### Minor Changes

- [#11715](https://github.com/alwaysmeticulous/meticulous/pull/11715) [`fed0068`](https://github.com/alwaysmeticulous/meticulous/commit/fed00687ed753102ecaad6e5f5aabbf089e5e9f1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Return all diffs by default when there are at most five, apply representative selection above that threshold (falling back to every matching diff for `--onlyUnreviewed` if the representative subset has already been fully reviewed), expose response-level `selectionApplied` metadata, and remove `isSelected` from current full-diff results. `--onlyRejected`/`--onlyWithComments` are unaffected by the cap and always return every matching diff.

### Patch Changes

- [#11689](https://github.com/alwaysmeticulous/meticulous/pull/11689) [`2c15475`](https://github.com/alwaysmeticulous/meticulous/commit/2c15475d9661cd496699f07901fd487800b717d1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `onlyWithComments` to `agent test-run-diffs`, the client API, and the hosted MCP tool, and report `numWithOpenComments` in the `--counts` totals.

  Multiple `only*` row filters now combine as a union: a difference is returned if it matches any enabled filter, so combining them widens the result rather than narrowing it. Requesting `onlyUnreviewed` together with `onlyRejected` previously failed with a `400` / `CliUserError`; that error is gone and the pair now returns both sets, so a caller that was relying on it to catch a mis-set flag pair gets a larger result instead.

- [#11816](https://github.com/alwaysmeticulous/meticulous/pull/11816) [`f72e7ba`](https://github.com/alwaysmeticulous/meticulous/commit/f72e7ba907ead8e3e5fd6883e23f9642abeea866) Thanks [@dennysem](https://github.com/dennysem)! - `meticulous record backend -- <dev command>` no longer aborts the dev command when the recorder cannot start. Failures resolving the recording token, fetching the sidecar bundle or bringing the sidecar up are now reported as warnings and the dev command runs unrecorded. Sidecar-only mode (no `--` dev command) still fails fast.

- [#11634](https://github.com/alwaysmeticulous/meticulous/pull/11634) [`707f914`](https://github.com/alwaysmeticulous/meticulous/commit/707f914745a7857551d8759970ed10872d38bdd1) Thanks [@OCzarnecki](https://github.com/OCzarnecki)! - `ci run-with-uploaded-asset-chunks` now emits duplicate-path overlap warnings as a single stderr write, then prints the "Test run created" and "Verify assembled build assets" URLs on stderr afterward. This keeps those URLs as a clean trailing block when CI tools (e.g. Gradle) asynchronously merge stdout and stderr.

- [#11657](https://github.com/alwaysmeticulous/meticulous/pull/11657) [`1541c28`](https://github.com/alwaysmeticulous/meticulous/commit/1541c283cefc5015a0b210b2026547623edf843d) Thanks [@linpengzhang](https://github.com/linpengzhang)! - When no base test run is found, CLI base-fallback logs now say the test run is created without a base and that no sessions will be executed (instead of implying the run still proceeds).

- [#11653](https://github.com/alwaysmeticulous/meticulous/pull/11653) [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add a terminal `Skipped` test run status for runs that deliberately do not execute (e.g. when no base test run is available). The client sends a `clientVersion` on `getTestRun` so the backend can return `Skipped` to new clients and downgrade it to `Aborted` for pinned older CLIs.

- Updated dependencies [[`583b59c`](https://github.com/alwaysmeticulous/meticulous/commit/583b59c9d32fa3c21575765f8475a00f315d7b1d), [`a579631`](https://github.com/alwaysmeticulous/meticulous/commit/a579631e702203e78c81435b43162efec60893cf), [`15c3c0a`](https://github.com/alwaysmeticulous/meticulous/commit/15c3c0a1d173992db7963bf7f6bfc00831d26157), [`4c2c367`](https://github.com/alwaysmeticulous/meticulous/commit/4c2c367837bd717fcaa471730b3ac8c9224766d8), [`0ef2f27`](https://github.com/alwaysmeticulous/meticulous/commit/0ef2f27855381b29551b3f7b90ac92b6ed03e92d), [`672e710`](https://github.com/alwaysmeticulous/meticulous/commit/672e710e504b843d84ea0dae85612390b2b0ad26), [`fed0068`](https://github.com/alwaysmeticulous/meticulous/commit/fed00687ed753102ecaad6e5f5aabbf089e5e9f1), [`81aebb4`](https://github.com/alwaysmeticulous/meticulous/commit/81aebb44218d2a2a3a6d0240cd9ff5e66edbbc71), [`54741e1`](https://github.com/alwaysmeticulous/meticulous/commit/54741e1ab73a0e2ffa40e59eb7a0f8340b309095), [`2c15475`](https://github.com/alwaysmeticulous/meticulous/commit/2c15475d9661cd496699f07901fd487800b717d1), [`8346ef7`](https://github.com/alwaysmeticulous/meticulous/commit/8346ef7ff80d1e24f1ce692a61789083a0cb187e), [`1541c28`](https://github.com/alwaysmeticulous/meticulous/commit/1541c283cefc5015a0b210b2026547623edf843d), [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c)]:
  - @alwaysmeticulous/client@2.323.0
  - @alwaysmeticulous/remote-replay-launcher@2.323.0
  - @alwaysmeticulous/common@2.323.0
  - @alwaysmeticulous/api@2.323.0
  - @alwaysmeticulous/debug-workspace@2.323.0
  - @alwaysmeticulous/downloading-helpers@2.323.0
  - @alwaysmeticulous/record@2.323.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.323.0
  - @alwaysmeticulous/sentry@2.323.0
  - @alwaysmeticulous/tunnels-client@2.323.0
  - @alwaysmeticulous/sdk-bundles-api@2.323.0
  - @alwaysmeticulous/session-filters@2.323.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.322.0

### Minor Changes

- [#11624](https://github.com/alwaysmeticulous/meticulous/pull/11624) [`57c6f62`](https://github.com/alwaysmeticulous/meticulous/commit/57c6f6231fee758b3598d7e961d6422dbfb22b56) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Support companion assets when uploading a Docker container. Previously `--companionAssetsFolder`/`--companionAssetsZip`/`--companionAssetsRegex` only worked with `ci run-with-tunnel`; `ci upload-container` now accepts the same flags, plus a new `--companionAssetsPathInImage` to serve a bundle straight out of a path inside the uploaded image itself, with no local copy needed.

- [#11624](https://github.com/alwaysmeticulous/meticulous/pull/11624) [`57c6f62`](https://github.com/alwaysmeticulous/meticulous/commit/57c6f6231fee758b3598d7e961d6422dbfb22b56) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Export `labelCommitCore` (and its `LabelCommitOptions`/`LabelCommitResult` types) so commits can be labelled programmatically from custom scripts, without going through the `ci label-commit` CLI command.

### Patch Changes

- Updated dependencies [[`57c6f62`](https://github.com/alwaysmeticulous/meticulous/commit/57c6f6231fee758b3598d7e961d6422dbfb22b56)]:
  - @alwaysmeticulous/client@2.322.0
  - @alwaysmeticulous/remote-replay-launcher@2.322.0
  - @alwaysmeticulous/debug-workspace@2.322.0
  - @alwaysmeticulous/downloading-helpers@2.322.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.322.0

## 2.321.0

### Minor Changes

- [#11571](https://github.com/alwaysmeticulous/meticulous/pull/11571) [`064702f`](https://github.com/alwaysmeticulous/meticulous/commit/064702f02963eff44863ea6676c015e60e5276c1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add open review-comment counts to test-run diffs and add diff-comments CLI/MCP retrieval with nested replies, with resolved comments available on request. Share exact JSON serialization between CLI and MCP outputs.

- [#11574](https://github.com/alwaysmeticulous/meticulous/pull/11574) [`b5b2c6b`](https://github.com/alwaysmeticulous/meticulous/commit/b5b2c6ba1b85d3e5c8090802b9c947bcb98a5734) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Simplify `agent test-run-diffs` output by removing redundant `index` and `outcome` fields and making `mismatchFraction` opt-in via `--includeMismatchFraction`. This also changes `getTestRunDiffsSummary`'s return type in `@alwaysmeticulous/client`: `DiffsSummaryResponse.data` is now `DiffsSummaryDiff[]` (a flat `{ replayDiffId, screenshotName, ... }` list) instead of the nested `DiffsSummaryReplayDiff[]` (one entry per replay diff, each with a `screenshots` array) — a compile break for any direct caller of `getTestRunDiffsSummary`.

- [#11570](https://github.com/alwaysmeticulous/meticulous/pull/11570) [`3096d56`](https://github.com/alwaysmeticulous/meticulous/commit/3096d56bbb7341fd2af918050bf59496b9a57e28) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add an `--onlyRejected` filter to `agent test-run-diffs` and the corresponding `onlyRejected` option to the client API. The hosted `get_test_run_diffs` MCP tool now exposes the same filter.

### Patch Changes

- Updated dependencies [[`3529e08`](https://github.com/alwaysmeticulous/meticulous/commit/3529e081dc13602a463e3d47c64b674316777722), [`064702f`](https://github.com/alwaysmeticulous/meticulous/commit/064702f02963eff44863ea6676c015e60e5276c1), [`5bfa22f`](https://github.com/alwaysmeticulous/meticulous/commit/5bfa22f2ffb76e357ef9bed77f30ef29538a3b58), [`b5b2c6b`](https://github.com/alwaysmeticulous/meticulous/commit/b5b2c6ba1b85d3e5c8090802b9c947bcb98a5734), [`3096d56`](https://github.com/alwaysmeticulous/meticulous/commit/3096d56bbb7341fd2af918050bf59496b9a57e28)]:
  - @alwaysmeticulous/api@2.321.0
  - @alwaysmeticulous/common@2.321.0
  - @alwaysmeticulous/client@2.321.0
  - @alwaysmeticulous/sdk-bundles-api@2.321.0
  - @alwaysmeticulous/downloading-helpers@2.321.0
  - @alwaysmeticulous/record@2.321.0
  - @alwaysmeticulous/remote-replay-launcher@2.321.0
  - @alwaysmeticulous/session-filters@2.321.0
  - @alwaysmeticulous/debug-workspace@2.321.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.321.0
  - @alwaysmeticulous/sentry@2.321.0
  - @alwaysmeticulous/tunnels-client@2.321.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.320.0

### Patch Changes

- Updated dependencies [[`70bac9c`](https://github.com/alwaysmeticulous/meticulous/commit/70bac9c3859ae034b3acccc059323cdc313b1873)]:
  - @alwaysmeticulous/client@2.320.0
  - @alwaysmeticulous/debug-workspace@2.320.0
  - @alwaysmeticulous/downloading-helpers@2.320.0
  - @alwaysmeticulous/remote-replay-launcher@2.320.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.320.0

## 2.319.0

### Patch Changes

- Updated dependencies [[`539f672`](https://github.com/alwaysmeticulous/meticulous/commit/539f672e598db9270ac5014dc43632a08b827fa5), [`ffd6711`](https://github.com/alwaysmeticulous/meticulous/commit/ffd6711945c015a2e357483cfe19f5cd1ff6af9b), [`46fce61`](https://github.com/alwaysmeticulous/meticulous/commit/46fce6165d356e006bd432c16c194034cce4b7c9), [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b)]:
  - @alwaysmeticulous/client@2.319.0
  - @alwaysmeticulous/sdk-bundles-api@2.319.0
  - @alwaysmeticulous/api@2.319.0
  - @alwaysmeticulous/debug-workspace@2.319.0
  - @alwaysmeticulous/downloading-helpers@2.319.0
  - @alwaysmeticulous/remote-replay-launcher@2.319.0
  - @alwaysmeticulous/common@2.310.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.319.0
  - @alwaysmeticulous/record@2.319.0
  - @alwaysmeticulous/session-filters@2.319.0

## 2.318.0

### Minor Changes

- [#11553](https://github.com/alwaysmeticulous/meticulous/pull/11553) [`d9267a0`](https://github.com/alwaysmeticulous/meticulous/commit/d9267a01c67a677f21f1d7e3dcdf4936633d6616) Thanks [@claude](https://github.com/apps/claude)! - Add `meticulous ci label-commit` command (and `labelCommit` client API) for attaching labels to commits. The only supported label for now is `not-relevant`, which marks a commit as not affecting the app under test so base test run resolution can skip over it when looking for a test run to compare against.

### Patch Changes

- Updated dependencies [[`8e70c70`](https://github.com/alwaysmeticulous/meticulous/commit/8e70c70c295cf5f34374a19b218b0711dd2ad260), [`d9267a0`](https://github.com/alwaysmeticulous/meticulous/commit/d9267a01c67a677f21f1d7e3dcdf4936633d6616), [`4683ec6`](https://github.com/alwaysmeticulous/meticulous/commit/4683ec6e7d3899395bf5a75e4f742096b212485f)]:
  - @alwaysmeticulous/client@2.318.0
  - @alwaysmeticulous/downloading-helpers@2.318.0
  - @alwaysmeticulous/debug-workspace@2.318.0
  - @alwaysmeticulous/remote-replay-launcher@2.318.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.318.0

## 2.317.0

### Minor Changes

- [#11536](https://github.com/alwaysmeticulous/meticulous/pull/11536) [`d9529f2`](https://github.com/alwaysmeticulous/meticulous/commit/d9529f22ff910760c52117668cf27c653a7abe73) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add a `--containerEnv name=value` flag to `meticulous simulate` for injecting extra environment variables into the app container when replaying against an `uploaded-container://` app URL. These are appended after the env vars registered with the container upload and the backend replay env vars, so they override both.

## 2.316.1

### Patch Changes

- Updated dependencies [[`4fa92e5`](https://github.com/alwaysmeticulous/meticulous/commit/4fa92e5017b750814239ecf2d10443b9dfd560ba), [`ee12bbe`](https://github.com/alwaysmeticulous/meticulous/commit/ee12bbea3fa268e30ac6bf6d335fbef694ee3287)]:
  - @alwaysmeticulous/client@2.316.1
  - @alwaysmeticulous/debug-workspace@2.316.1
  - @alwaysmeticulous/downloading-helpers@2.316.1
  - @alwaysmeticulous/remote-replay-launcher@2.316.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.316.1

## 2.316.0

### Minor Changes

- [#11448](https://github.com/alwaysmeticulous/meticulous/pull/11448) [`061d6fb`](https://github.com/alwaysmeticulous/meticulous/commit/061d6fb0038caa690245acbbbe66248fe9386bef) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Allow container-based agentic PR tests to use recorded-session network mocks.

### Patch Changes

- [#11479](https://github.com/alwaysmeticulous/meticulous/pull/11479) [`10f5702`](https://github.com/alwaysmeticulous/meticulous/commit/10f5702462ab33e1050fa064eee4f383ec06ac84) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent js-coverage --testRunId` now returns coverage for base test runs (status `Partial`) instead of rejecting them. A base run executes its sessions on demand so it never reaches a verdict, but it does record coverage as those sessions replay — the backend has always served it, so the CLI was refusing data the equivalent MCP tool returned. The command notes on stderr that the coverage reflects the sessions replayed so far and grows over time. `agent test-run-diffs` still rejects base runs, now saying plainly that such a run has no changes/diffs.

  Two further base-run cases now get an explanation rather than a bare failure: `--prDiffOnly` is rejected up front (a base run has no PR, so its PR-scoped coverage is empty by construction), and a base run whose sessions have not been replayed yet reports that instead of surfacing the backend's "coverage artifact not found" as an unexpected error.

  The `--project` option on `agent js-coverage` and `agent test-run-diffs` now documents that it cannot be combined with `--testRunId`/`--testRunIds` — already enforced, but previously undocumented.

- [#11500](https://github.com/alwaysmeticulous/meticulous/pull/11500) [`6ba0dd6`](https://github.com/alwaysmeticulous/meticulous/commit/6ba0dd62bc7cba90c344e80b6167a2c1c3ee9e56) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `@alwaysmeticulous/client` gains `declareClientAppInfo(appInfo)`, which labels the `User-Agent` of every client the process subsequently creates — including clients built deep inside dependencies, which is why it goes through the environment rather than the `appInfo` option. An identity already present in the environment wins, so an outer consumer that labelled the process (e.g. a GitHub Action that then invokes the CLI) keeps its attribution.

  The CLI now calls it at the start of `main`, so requests made by a CLI command are labelled `cli`. This makes CLI traffic distinguishable from direct use of the client as a library: a process that declares nothing sends the bare client `User-Agent`, which is therefore the signature of code that imported the package and called it directly. Nothing changes for consumers that already set `appInfo` or `METICULOUS_CLIENT_USER_AGENT_SUFFIX`.

- [#11449](https://github.com/alwaysmeticulous/meticulous/pull/11449) [`777bfaf`](https://github.com/alwaysmeticulous/meticulous/commit/777bfaf0c3c169a367b3bba7244973023a2908f3) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `meticulous crawl` now resolves auth the same way as other commands (explicit `--apiToken` → OAuth login → `METICULOUS_API_TOKEN` → legacy config file), so it honors `meticulous auth set-project` and prompts for a browser login when no credentials are stored, instead of silently recording into whatever project a legacy config-file token points at. Also fixes `--maxNumSessions` closing the browser before the manual-login prompt: the cap is now only enforced once crawling actually starts, and sessions recorded while logging in no longer count towards it.

- Updated dependencies [[`b20dc05`](https://github.com/alwaysmeticulous/meticulous/commit/b20dc05866f60875b8589e4e8ac7837c07da542c), [`80151d6`](https://github.com/alwaysmeticulous/meticulous/commit/80151d63704a7acae0c157d112cb39825c1ce287), [`6ba0dd6`](https://github.com/alwaysmeticulous/meticulous/commit/6ba0dd62bc7cba90c344e80b6167a2c1c3ee9e56), [`777bfaf`](https://github.com/alwaysmeticulous/meticulous/commit/777bfaf0c3c169a367b3bba7244973023a2908f3), [`061d6fb`](https://github.com/alwaysmeticulous/meticulous/commit/061d6fb0038caa690245acbbbe66248fe9386bef)]:
  - @alwaysmeticulous/client@2.316.0
  - @alwaysmeticulous/sdk-bundles-api@2.316.0
  - @alwaysmeticulous/remote-replay-launcher@2.316.0
  - @alwaysmeticulous/debug-workspace@2.316.0
  - @alwaysmeticulous/downloading-helpers@2.316.0
  - @alwaysmeticulous/common@2.310.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.316.0

## 2.315.0

### Minor Changes

- [#11388](https://github.com/alwaysmeticulous/meticulous/pull/11388) [`5931dfd`](https://github.com/alwaysmeticulous/meticulous/commit/5931dfd6fd798e1a45cf5f507005e71e9018396f) Thanks [@claude](https://github.com/apps/claude)! - Add a customer-facing `meticulous crawl` command. It crawls your app from a given start URL in a local headed browser — pausing first so you can manually log in — records the visited pages as sessions, and then creates a test run from them. Auth uses your project API token; the sessions and test run are always scoped to that project.

- [#11317](https://github.com/alwaysmeticulous/meticulous/pull/11317) [`f92d563`](https://github.com/alwaysmeticulous/meticulous/commit/f92d5637fbaf6ca1941394185db539f80c9d2aaf) Thanks [@alexivanov](https://github.com/alexivanov)! - Add backend session recording for Cloudflare Workers (workerd) apps during local development. The new `@alwaysmeticulous/backend-recorder-workerd` package provides a `withMeticulous` handler wrapper that captures inbound requests and outgoing `fetch` calls, and the new `meticulous record backend` CLI command starts the Meticulous recorder sidecar and wraps your dev command (e.g. `meticulous record backend -- npx wrangler dev`).

### Patch Changes

- Updated dependencies [[`62f456b`](https://github.com/alwaysmeticulous/meticulous/commit/62f456b0587d1fbed430e532b25bfabd7e2a4c93), [`e021d1c`](https://github.com/alwaysmeticulous/meticulous/commit/e021d1c4d587c629f1d67a5deb85bb6243608505), [`95053ea`](https://github.com/alwaysmeticulous/meticulous/commit/95053ea5c096a25076452e32ac9e8b07f8ce3fe7), [`5931dfd`](https://github.com/alwaysmeticulous/meticulous/commit/5931dfd6fd798e1a45cf5f507005e71e9018396f), [`f3c5e3b`](https://github.com/alwaysmeticulous/meticulous/commit/f3c5e3b77edd8cd1cf9de3c1e28c308a86247a45)]:
  - @alwaysmeticulous/client@2.315.0
  - @alwaysmeticulous/sdk-bundles-api@2.315.0
  - @alwaysmeticulous/debug-workspace@2.315.0
  - @alwaysmeticulous/downloading-helpers@2.315.0
  - @alwaysmeticulous/remote-replay-launcher@2.315.0
  - @alwaysmeticulous/common@2.310.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.315.0

## 2.314.0

### Minor Changes

- [#11328](https://github.com/alwaysmeticulous/meticulous/pull/11328) [`21b5979`](https://github.com/alwaysmeticulous/meticulous/commit/21b59793a2e0819f70062b544879abae43b023c9) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add `meticulous agent submit-feedback` (and the `submitAgentFeedback` client function) so AI coding agents can submit free-form feedback about Meticulous — whether it helped catch or debug a problem, what was confusing, and what information would have made their task easier — optionally tagged with an outcome, test run, skill, and agent name/model.

### Patch Changes

- Updated dependencies [[`21b5979`](https://github.com/alwaysmeticulous/meticulous/commit/21b59793a2e0819f70062b544879abae43b023c9)]:
  - @alwaysmeticulous/client@2.314.0
  - @alwaysmeticulous/debug-workspace@2.314.0
  - @alwaysmeticulous/downloading-helpers@2.314.0
  - @alwaysmeticulous/remote-replay-launcher@2.314.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.314.0

## 2.313.1

### Patch Changes

- [#11314](https://github.com/alwaysmeticulous/meticulous/pull/11314) [`47f4c67`](https://github.com/alwaysmeticulous/meticulous/commit/47f4c6784db1ef66a2a11a8806549909d38c227d) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Allow the CLI and client to proceed without an API token, omitting the Authorization header so environments that inject auth can work. On 401/403 responses when no token was sent, surface guidance that authentication is probably missing.

- Updated dependencies [[`47f4c67`](https://github.com/alwaysmeticulous/meticulous/commit/47f4c6784db1ef66a2a11a8806549909d38c227d)]:
  - @alwaysmeticulous/client@2.313.1
  - @alwaysmeticulous/remote-replay-launcher@2.313.1
  - @alwaysmeticulous/tunnels-client@2.313.1
  - @alwaysmeticulous/debug-workspace@2.313.1
  - @alwaysmeticulous/downloading-helpers@2.313.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.313.1

## 2.313.0

### Minor Changes

- [#11208](https://github.com/alwaysmeticulous/meticulous/pull/11208) [`3eaa104`](https://github.com/alwaysmeticulous/meticulous/commit/3eaa10473902958c66bc903bb98c3ad35bd10f6b) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add an uploaded-assets mode to agentic PR-time testing. The new `meticulous ci agent-test` command accepts exactly one of `--localImageTag`, `--assetsDir`, or `--assetsUploadId`, plus an optional `--backendUrl` pointing at a customer staging backend (credentials are read from `METICULOUS_STAGING_USERNAME` / `METICULOUS_STAGING_PASSWORD`, proxied path prefixes from `--backendProxyPaths`, default `/api`). With assets targets the agent worker serves the uploaded frontend itself and either reverse-proxies API calls to the staging backend or stubs them from recorded sessions when no backend is given. The client gains the `AgenticAppTarget` discriminated union (`container` / `assets`) and `AgenticAssetsBackend` types, and `remote-replay-launcher`'s `generateSessions` can now upload an assets directory (or reuse an existing upload) instead of a container image.

### Patch Changes

- Updated dependencies [[`b72db94`](https://github.com/alwaysmeticulous/meticulous/commit/b72db94c764ca46ee0bd2d71fe5b4c2e9a0ef05f), [`3eaa104`](https://github.com/alwaysmeticulous/meticulous/commit/3eaa10473902958c66bc903bb98c3ad35bd10f6b), [`474ad7e`](https://github.com/alwaysmeticulous/meticulous/commit/474ad7eaa1d2a4c072305af9e6ae8b419dd19046), [`021af14`](https://github.com/alwaysmeticulous/meticulous/commit/021af14acacf4e34df568ac1058bc61b21611a7c), [`474ad7e`](https://github.com/alwaysmeticulous/meticulous/commit/474ad7eaa1d2a4c072305af9e6ae8b419dd19046)]:
  - @alwaysmeticulous/client@2.313.0
  - @alwaysmeticulous/remote-replay-launcher@2.313.0
  - @alwaysmeticulous/downloading-helpers@2.313.0
  - @alwaysmeticulous/debug-workspace@2.313.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.313.0

## 2.312.0

### Minor Changes

- [#11137](https://github.com/alwaysmeticulous/meticulous/pull/11137) [`a45a77f`](https://github.com/alwaysmeticulous/meticulous/commit/a45a77f8157baa074cea216cdb9c620066750187) Thanks [@OCzarnecki](https://github.com/OCzarnecki)! - Add `--latestForProject` to `meticulous agent js-coverage`. It resolves the project's preferred latest successful test run—the same run used by the webapp's project coverage view—and returns that run's whole-run coverage with the existing coverage columns and filters. `--project` optionally overrides an OAuth user's configured default project; project API tokens derive the project from the token. The client exposes the same operation as `getProjectJsCoverage`.

### Patch Changes

- Updated dependencies [[`d1ba630`](https://github.com/alwaysmeticulous/meticulous/commit/d1ba63009cdcb1227f9bdfe03af27a87ca7f819b), [`a45a77f`](https://github.com/alwaysmeticulous/meticulous/commit/a45a77f8157baa074cea216cdb9c620066750187), [`2b3c422`](https://github.com/alwaysmeticulous/meticulous/commit/2b3c422c47804ec7adfa79b4375c6bda7887c73c)]:
  - @alwaysmeticulous/client@2.312.0
  - @alwaysmeticulous/api@2.312.0
  - @alwaysmeticulous/debug-workspace@2.312.0
  - @alwaysmeticulous/downloading-helpers@2.312.0
  - @alwaysmeticulous/remote-replay-launcher@2.312.0
  - @alwaysmeticulous/common@2.310.0
  - @alwaysmeticulous/record@2.312.0
  - @alwaysmeticulous/sdk-bundles-api@2.312.0
  - @alwaysmeticulous/session-filters@2.312.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.312.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.311.0

### Minor Changes

- [#11176](https://github.com/alwaysmeticulous/meticulous/pull/11176) [`eeb76d2`](https://github.com/alwaysmeticulous/meticulous/commit/eeb76d2d381179852f572e54f99a0d644dcd3770) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `meticulous auth login --device` (OAuth 2.0 Device Authorization Grant), so users can log in from remote or sandboxed machines — SSH sessions, containers, cloud coding agents — where a browser can't reach the CLI's localhost callback. `--non-interactive` is unchanged and still prints a loopback URL for same-machine completion; use `--device` instead when the browser is on a different machine.

### Patch Changes

- Updated dependencies [[`7803a09`](https://github.com/alwaysmeticulous/meticulous/commit/7803a0993df1757f7cac69813630f16744fe9b91), [`7803a09`](https://github.com/alwaysmeticulous/meticulous/commit/7803a0993df1757f7cac69813630f16744fe9b91), [`eeb76d2`](https://github.com/alwaysmeticulous/meticulous/commit/eeb76d2d381179852f572e54f99a0d644dcd3770)]:
  - @alwaysmeticulous/client@2.311.0
  - @alwaysmeticulous/debug-workspace@2.311.0
  - @alwaysmeticulous/downloading-helpers@2.311.0
  - @alwaysmeticulous/remote-replay-launcher@2.311.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.311.0

## 2.310.0

### Minor Changes

- [#11064](https://github.com/alwaysmeticulous/meticulous/pull/11064) [`2e0a336`](https://github.com/alwaysmeticulous/meticulous/commit/2e0a336a9366dc0bb81a3d18e4c577a6a6a4261b) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs`: the `--json` output is now always a flat, index-ordered list (one object per screenshot diff), matching the hosted MCP tool's shape — `--orderByReplayDiffs` now only changes the `index` ordering, not the structure. The `mismatch` column/field is renamed to `mismatchFraction` in both TSV and JSON, and JSON now omits absent optional fields instead of emitting `null`/`false` (TSV still emits empty columns).

  `agent timeline-diff`: the `--json` `diff` field now carries the raw status enum (`identical`/`removed`/`added`/`changed`) instead of a prefix symbol, matching the hosted MCP tool. The TSV `diff` column keeps its compact prefix symbol.

  `agent image-urls` / `image-files`: for `missing-base`/`missing-head` outcomes, the CLI now prints/downloads `after`/`before` respectively instead of the old single `screenshot` line/label — the field now names which side the lone image is. `ScreenshotUrlsResponse.screenshot` is deprecated (still populated with the same value as `after`/`before`, for already-published CLI versions) and will be removed in a future major. Human-mode key-value lines are now `key:\tvalue` (a colon then a tab) instead of `key: value` — matching `agent test-run-diffs --counts`, which changes from a bare `key\tvalue` to the same `key:\tvalue` format.

  `agent dom-diff`: the `--index` option (and the corresponding `getScreenshotDomDiff` client parameter) is removed — it was unused and made the response shape switch between a single hunk and a list depending on whether it was passed. The command/tool always returns the full hunk list now.

  `agent js-coverage-diff`: the `--includeAllFiles` option is removed — the `--json`/TSV rows come only from the base/head diff, which by construction never contains a file with no ranges on either side, so the option never affected them (only the stderr summary's base/head file counts, which are also dropped).

- [#11071](https://github.com/alwaysmeticulous/meticulous/pull/11071) [`7ee1f36`](https://github.com/alwaysmeticulous/meticulous/commit/7ee1f361af4bcc76a3a1da96c216c658cf992594) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `--maxDurationSeconds` to `meticulous agent trigger-test-run` to cap each replay's duration for explicitly pinned `--sessionIds`, overriding the project's configured cap (defaults to 300s/5min; pass `none` for unlimited — useful for newly custom-recorded sessions with unusually long flows). A trimmed session now surfaces as a neutral, informational entry in its replay timeline (it does not count towards session-health warnings or register as a diff/divergence).

### Patch Changes

- [#10444](https://github.com/alwaysmeticulous/meticulous/pull/10444) [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Decouple agentic instructions from the deployment: they are now uploaded per-trigger to the pr-test-pilot bucket and correlated to the run by a server-minted `instructionsId` (returned from `requestAgenticInstructionsUpload`), rather than stored under the deployment's `uploadId`. `requestAgenticInstructionsUpload` now posts to `agentic-session-generation/request-instructions-upload` (dropping `uploadId`, returning `{ uploadUrl, instructionsId }`), and `completeAgenticSessionGeneration` posts to `agentic-session-generation/launch` and takes an optional `instructionsId` in place of `hasInstructions`.

- [#10709](https://github.com/alwaysmeticulous/meticulous/pull/10709) [`6e8ee26`](https://github.com/alwaysmeticulous/meticulous/commit/6e8ee260645ef3f97406f6ff459607a0c2925b51) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `ci run-with-uploaded-asset-chunks` now accepts `{ name, versionLookup: "latest-in-history" }` entries in its asset references manifest, resolving unchanged chunks from the base test run's history. `baseSha` is optional for such manifests — the backend infers the base it will compare the run against (recommended, since user-supplied base SHAs are easy to get wrong for PRs), and `baseSha` only overrides it. The CLI rejects duplicate chunk names and prints resolved chunk path overlaps as last-wins warnings. The remote replay launcher skips the pointless no-base fallback for `versionLookup` manifests, surfacing an actionable message instead.

- [#11063](https://github.com/alwaysmeticulous/meticulous/pull/11063) [`c500bb7`](https://github.com/alwaysmeticulous/meticulous/commit/c500bb70a38d0d019727e30f7613a6305a0c01ca) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `meticulous agent sessions` to list a project's most recently created sessions (newest first) — useful for finding the id of a session you just recorded. Default columns: `id`, `createdAt` (the stored row timestamp and the ordering basis), `recordedAt` (for a non-original session, the root session's recording time; otherwise the same as `createdAt`), `recordedBy`, `status` (`original`, `patched`, `sliced`, or `mutated`). Opt into `startUrl` with `--includeStartUrl` and `abandonedReason` with `--includeAbandonedReason`. Filter with `--createdSince`/`--createdUntil` (row timestamp), `--recordedSince`/`--recordedUntil` (root recording time), `--recordedBy` (recording identity), `--excludeSyntheticSessions` (also drops the `status` column), and `--visitedUrlFilter` (a glob where only `*` is a wildcard, matched against visited URLs and the startUrl). `--limit` defaults to 100 (max 1000) and always applies; `--offset` pages through further. `--json` outputs a bare array (matching the new hosted MCP tool, `get_sessions`).

- [#10983](https://github.com/alwaysmeticulous/meticulous/pull/10983) [`92cf228`](https://github.com/alwaysmeticulous/meticulous/commit/92cf228bde89a2a984f1264ef02987bf4a7fb040) Thanks [@Que3216](https://github.com/Que3216)! - Warn when `--rewrites` source patterns look like regular expressions instead of globs. Detects common regex substrings (capture groups, character classes, anchors, etc.) and logs a warning pointing to the glob syntax docs.

- Updated dependencies [[`2e0a336`](https://github.com/alwaysmeticulous/meticulous/commit/2e0a336a9366dc0bb81a3d18e4c577a6a6a4261b), [`7ee1f36`](https://github.com/alwaysmeticulous/meticulous/commit/7ee1f361af4bcc76a3a1da96c216c658cf992594), [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882), [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882), [`6e8ee26`](https://github.com/alwaysmeticulous/meticulous/commit/6e8ee260645ef3f97406f6ff459607a0c2925b51), [`b22d975`](https://github.com/alwaysmeticulous/meticulous/commit/b22d9752538e6efdbfe74a14c002e61764c9fb0e), [`0d35d4d`](https://github.com/alwaysmeticulous/meticulous/commit/0d35d4d136ea4b0d5a7c0395189203e5831b6081), [`c500bb7`](https://github.com/alwaysmeticulous/meticulous/commit/c500bb70a38d0d019727e30f7613a6305a0c01ca)]:
  - @alwaysmeticulous/client@2.310.0
  - @alwaysmeticulous/remote-replay-launcher@2.310.0
  - @alwaysmeticulous/api@2.310.0
  - @alwaysmeticulous/common@2.310.0
  - @alwaysmeticulous/debug-workspace@2.310.0
  - @alwaysmeticulous/downloading-helpers@2.310.0
  - @alwaysmeticulous/record@2.310.0
  - @alwaysmeticulous/sdk-bundles-api@2.310.0
  - @alwaysmeticulous/session-filters@2.310.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.310.0
  - @alwaysmeticulous/sentry@2.310.0
  - @alwaysmeticulous/tunnels-client@2.310.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.309.0

### Minor Changes

- [#10951](https://github.com/alwaysmeticulous/meticulous/pull/10951) [`13c087b`](https://github.com/alwaysmeticulous/meticulous/commit/13c087b6b3f1610526826a70526ff6b7e0a15b8a) Thanks [@phreppo](https://github.com/phreppo)! - Remove the native `re2` dependency from `@alwaysmeticulous/session-filters`, including the exported `compileSessionFilter` function (breaking change for any direct consumers of that export). Session filter regexes are no longer compiled client-side — the backend already validates regex syntax with RE2 at the API boundary and returns a clear error if compilation fails, so client-side compilation was redundant and required bundling/building the native `re2` module. The CLI and backend now only perform structural validation (e.g. length, count) client-side.

### Patch Changes

- Updated dependencies [[`13c087b`](https://github.com/alwaysmeticulous/meticulous/commit/13c087b6b3f1610526826a70526ff6b7e0a15b8a)]:
  - @alwaysmeticulous/session-filters@2.309.0

## 2.308.0

### Minor Changes

- [#10900](https://github.com/alwaysmeticulous/meticulous/pull/10900) [`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs --counts` now reports aggregate totals from a dedicated, server-side counts endpoint (`getTestRunDiffsSummaryCounts`) instead of counting the fetched list client-side — so it returns just the numbers rather than transferring the full diffs list. The counts are: `numReplays` (executed replay comparisons), `numDiffs` (deduplicated user-visible differences), and the decision breakdown `numApproved` / `numIgnored` / `numRejected` / `numUnreviewed` (which sum to `numDiffs`). Computed live server-side (replay diffs + `diff_decisions`), so no diffs-summary computation/poll is needed.

- [#10900](https://github.com/alwaysmeticulous/meticulous/pull/10900) [`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs` can now surface PR review decisions. `--includeReviewDecisions` adds a `decision` column/field per diff (`accepted` / `rejected` / `ignored` / `unreviewed`; `unreviewed` when undecided or the run has no PR), resolved against the test run's PR at request time. `--onlyUnreviewed` returns just the differences still awaiting review — across every difference, not only the selected representative subset (it implies `--includeAllDiffs`, so each row carries the `isSelected` column to tell selected from unselected differences). For a count of what's left to review without listing them, use `--counts`, whose `numUnreviewed` (part of the decision breakdown) gives that number. Both are opt-in query params, so no diffs-summary contract version bump.

### Patch Changes

- [#10945](https://github.com/alwaysmeticulous/meticulous/pull/10945) [`74afc3c`](https://github.com/alwaysmeticulous/meticulous/commit/74afc3c5c455c2a88e61e60be9ff9a11766a0ce8) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Load the native `re2` module lazily in `@alwaysmeticulous/session-filters`. Previously `re2` was imported at module load time, so it was required as soon as the CLI started (via the session-filter code path). In environments that skip native build scripts on install — e.g. `pnpm dlx` / `pnpx` under pnpm's strict build-script policy — the `re2.node` binary is never built, so the CLI crashed on startup with `Cannot find module './build/Release/re2.node'`. `re2` is now only required when a session filter is actually validated or compiled, so the CLI runs normally when session filters are not used.

- Updated dependencies [[`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37), [`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37), [`74afc3c`](https://github.com/alwaysmeticulous/meticulous/commit/74afc3c5c455c2a88e61e60be9ff9a11766a0ce8)]:
  - @alwaysmeticulous/client@2.308.0
  - @alwaysmeticulous/session-filters@2.308.0
  - @alwaysmeticulous/debug-workspace@2.308.0
  - @alwaysmeticulous/downloading-helpers@2.308.0
  - @alwaysmeticulous/remote-replay-launcher@2.308.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.308.0

## 2.307.0

### Minor Changes

- [#10679](https://github.com/alwaysmeticulous/meticulous/pull/10679) [`73b0b40`](https://github.com/alwaysmeticulous/meticulous/commit/73b0b401960bdd2e5f7b87aa3ac8d8f05f6f156e) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs` now reports differences only, aligned with the shared difference classifier. The `--includeMatches` flag is removed (matching screenshots, known flakes, and screenshots downstream of a divergence are no longer part of the summary), and the `total` column is dropped. The `index` column is now always emitted as a global rank: a flat priority rank by default, or a replayDiff-grouped rank under `--orderByReplayDiffs`. `agent image-urls`, `agent image-files`, and `agent dom-diff` continue to work for any replay diff + `screenshotName` (including screenshots with no diff) when you need to inspect a screenshot that isn't in the summary.

- [#10853](https://github.com/alwaysmeticulous/meticulous/pull/10853) [`09610cb`](https://github.com/alwaysmeticulous/meticulous/commit/09610cb51b85bc763123b537917a19e04d09aa10) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous auth set-project` now persists the selected project as a per-user setting on the backend, instead of in a local file — so it's consistent across machines and visible to the hosted MCP server, which has no access to local files. A new `meticulous auth get-project` prints the resolved project for scripting. `meticulous auth login` selects a project after logging in: an explicit `--project` (or, interactively, the picker) is persisted, a sole accessible project is auto-selected, and an existing default is respected as-is — so a returning `--non-interactive` login succeeds instead of failing for lack of a picker. `--project` on both `set-project` and `login` accepts a bare id, an `organization/name` slug, or a unique bare name (resolved server-side), not just the full slug. `meticulous auth logout` leaves the backend setting untouched (it's account state, not machine state). On the first OAuth-authenticated command after upgrading, any existing local `selected-project.json` is migrated to the backend setting once and then removed. The default can be changed but not cleared from the UI/CLI (the choice is always _which_ project, never none).

  `@alwaysmeticulous/client` gains `getOAuthDefaultProject`, `setOAuthDefaultProject`, and `resolveDefaultProjectId`; it no longer exports `getStoredProjectId`, `getStoredProject`, `setStoredProject`, or `clearStoredProject` (the removed local-file-backed project storage).

  `meticulous agent test-run-for-commit`, `test-run-diffs`, `js-coverage`, and `trigger-test-run` gain a `--project` flag: a one-off override for that call only (resolved flexibly — id, `organization/name` slug, or a unique bare name among your accessible projects), which never changes the stored default. When omitted, these commands now rely entirely on the backend's own project resolution (the token's project, or the stored default) rather than pre-resolving one locally.

### Patch Changes

- [#10848](https://github.com/alwaysmeticulous/meticulous/pull/10848) [`de3bfd0`](https://github.com/alwaysmeticulous/meticulous/commit/de3bfd04adebad975d0771cf14afe58241409993) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Clarify the `screenshotName` help text for the `agent image-urls`, `agent image-files`, and `agent dom-diff` commands: names must be copied verbatim from the `screenshotName` column of `agent test-run-diffs` for that replay diff, and `auxiliary-<eventNumber>-<sequenceNumber>-<reason>` is now documented alongside `after-event-<n>` and `end-state`.

- [#10816](https://github.com/alwaysmeticulous/meticulous/pull/10816) [`16c6c2d`](https://github.com/alwaysmeticulous/meticulous/commit/16c6c2dc6252c3ebad566a384e06372ef206edfc) Thanks [@alexivanov](https://github.com/alexivanov)! - Sort accessible projects alphabetically (case-insensitive, by `organization/project` slug) in `meticulous auth set-project` and `meticulous auth list-projects` so the interactive picker, listing output, and "Available projects" error listings present projects in a predictable order regardless of API response order.

- Updated dependencies [[`73b0b40`](https://github.com/alwaysmeticulous/meticulous/commit/73b0b401960bdd2e5f7b87aa3ac8d8f05f6f156e), [`de3bfd0`](https://github.com/alwaysmeticulous/meticulous/commit/de3bfd04adebad975d0771cf14afe58241409993), [`6ff100c`](https://github.com/alwaysmeticulous/meticulous/commit/6ff100c685b4c6524171062664ee836d687c6ff8), [`09610cb`](https://github.com/alwaysmeticulous/meticulous/commit/09610cb51b85bc763123b537917a19e04d09aa10), [`55d7f95`](https://github.com/alwaysmeticulous/meticulous/commit/55d7f95265d434d2d01eae40589e7307f9110492), [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b), [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b)]:
  - @alwaysmeticulous/client@2.307.0
  - @alwaysmeticulous/debug-workspace@2.307.0
  - @alwaysmeticulous/remote-replay-launcher@2.307.0
  - @alwaysmeticulous/api@2.307.0
  - @alwaysmeticulous/sdk-bundles-api@2.307.0
  - @alwaysmeticulous/downloading-helpers@2.307.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/record@2.307.0
  - @alwaysmeticulous/session-filters@2.307.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.307.0

## 2.306.0

### Minor Changes

- [#10696](https://github.com/alwaysmeticulous/meticulous/pull/10696) [`c9dfd16`](https://github.com/alwaysmeticulous/meticulous/commit/c9dfd16bf6114470782e73362989fe9c97c2698f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs` now surfaces failed diffs-summary computations instead of polling forever. The diffs-summary endpoint returns a new `failed` status (with a `reason`) when the previous computation ended in a terminal-failure state (rather than silently restarting and reporting `pending`), and accepts a `retrigger` flag to start a fresh run over a failed one. The CLI retriggers once, up front, if the computation is already `failed` when the command starts; once it's polling, a `failed` result is reported immediately and the command exits, rather than looping until the timeout.

- [#10727](https://github.com/alwaysmeticulous/meticulous/pull/10727) [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd) Thanks [@phreppo](https://github.com/phreppo)! - Add a `--sessionFilter` option to `ci run-with-uploaded-asset-chunks` that restricts the triggered test run to sessions whose start URL matches at least one of the provided RE2 regexes.

- [#10702](https://github.com/alwaysmeticulous/meticulous/pull/10702) [`d493a2a`](https://github.com/alwaysmeticulous/meticulous/commit/d493a2a6fe7e931f09b32e8dbfe4b191aa103cab) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent js-coverage` now supports combining coverage from multiple test runs.
  - New `--headPlusTestRunIds` CLI flag: a comma-separated list of additional test run IDs to union with the run resolved by `--commitSha` (or the local git HEAD by default). Useful for seeing a project's normal coverage plus the coverage of a few extra runs, without running one combined test run. Cannot be combined with `--testRunId`.
  - New `--testRunIds` CLI flag: a comma-separated list of test run IDs where the first is the primary run and the rest are unioned in, for callers that already have an ordered list of run IDs on hand rather than a single run to resolve. Cannot be combined with `--testRunId`, `--commitSha`, or `--headPlusTestRunIds`.
  - The backend `GET agent/test-runs/:testRunId/js-coverage` endpoint gained a matching `unionTestRunIds` query param (comma-separated), and `@alwaysmeticulous/client`'s `getTestRunJsCoverage` gained a matching `unionTestRunIds` option. All listed test runs must belong to the same project and have executed the exact same commit as the primary.

### Patch Changes

- Updated dependencies [[`c9dfd16`](https://github.com/alwaysmeticulous/meticulous/commit/c9dfd16bf6114470782e73362989fe9c97c2698f), [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd), [`d493a2a`](https://github.com/alwaysmeticulous/meticulous/commit/d493a2a6fe7e931f09b32e8dbfe4b191aa103cab)]:
  - @alwaysmeticulous/client@2.306.0
  - @alwaysmeticulous/api@2.306.0
  - @alwaysmeticulous/session-filters@2.306.0
  - @alwaysmeticulous/remote-replay-launcher@2.306.0
  - @alwaysmeticulous/debug-workspace@2.306.0
  - @alwaysmeticulous/downloading-helpers@2.306.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/record@2.306.0
  - @alwaysmeticulous/sdk-bundles-api@2.306.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.306.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1

## 2.305.0

### Minor Changes

- [#10662](https://github.com/alwaysmeticulous/meticulous/pull/10662) [`7fb0f6c`](https://github.com/alwaysmeticulous/meticulous/commit/7fb0f6cfb11cfee7a93ad7ac4732ec9080be0432) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Make the CLI's output more consistent and machine-readable, especially for `agent` and `auth` commands.
  - **`agent` commands** now share a `--json` flag (in addition to `--verbose`): without `--verbose` each command prints only its actual output value or table on stdout (TSV, or a JSON array/object with `--json`), and all progress/notices go to stderr. `js-coverage`/`js-coverage-diff` `--json` now emits the projected rows (the same data as the TSV) rather than the raw backend response. Command descriptions now state what each command outputs.
  - **`auth` commands**: `whoami` and `list-projects` support `--json`; every `auth` command now prints only its actual output on stdout, with confirmations/hints on stderr.
  - **`--dryRun`** is now a per-command option, defined only on the commands that act on it, instead of a flag accepted on every command. It has been removed from `auth logout`. Because the CLI parses strictly, passing `--dryRun` to a command that does not declare it (e.g. `auth logout`, `download`, `record`) is now a hard error rather than a silently-ignored no-op.
  - For the `agent` test-run commands, the TSV (non-`--json`) output now always starts with a header row — including when the run is still in progress (with `--dontWaitForTestRunToComplete`) or has zero diffs/files — so stdout is never empty, matching the `[]` emitted with `--json`.
  - **`--rawJson` is renamed to `--jsonArgs`** (`--rawJson` still works as a deprecated alias).
  - Global flags (`--logLevel`, `--dataDir`, `--jsonArgs`, `--help`, `--version`) now render in a "Global Options:" section at the bottom of each command's `--help`, below the command's own options.
  - **`meticulous schema`** now covers the `agent` command tree, resolves command aliases (e.g. `schema replay`), reports deprecated options, and stays in sync with the real global options.
  - `meticulous debug --help` no longer shows a spurious `<command>` positional.

### Patch Changes

- Updated dependencies [[`f52aa9e`](https://github.com/alwaysmeticulous/meticulous/commit/f52aa9e6ff8d3f523a177f47f69e2039b268190b), [`ec6ab46`](https://github.com/alwaysmeticulous/meticulous/commit/ec6ab46b9685d8cb10dbb7bfac7442897a2caa57)]:
  - @alwaysmeticulous/sdk-bundles-api@2.305.0
  - @alwaysmeticulous/client@2.305.0
  - @alwaysmeticulous/remote-replay-launcher@2.305.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.305.0
  - @alwaysmeticulous/debug-workspace@2.305.0
  - @alwaysmeticulous/downloading-helpers@2.305.0

## 2.304.0

### Minor Changes

- [#10586](https://github.com/alwaysmeticulous/meticulous/pull/10586) [`879b04e`](https://github.com/alwaysmeticulous/meticulous/commit/879b04eac5966890f2b0d6f2aabf1ae139782f8d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent trigger-test-run` can now attach a git diff (`--gitDiffOutput`, or one inferred via `--repoDirectory`) when identifying the build by `--commitSha` instead of `--deploymentId`. The diff upload resolves the commit to a deployment server-side, and that resolved deployment is then reused for the trigger call, so both requests target the same deployment row.

- [#10609](https://github.com/alwaysmeticulous/meticulous/pull/10609) [`d22a9f3`](https://github.com/alwaysmeticulous/meticulous/commit/d22a9f3845ebe3a1a121d4839aa4facc4348db9d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - **Breaking:** removed `--repoDirectory` from `agent trigger-test-run` and `agent upload-build`. It only ever overrode the working directory used for local git inference — equivalent to running the command from that directory instead — and existed as a holdover from the `ci` trigger commands, which agents don't need since they can simply run the command from the directory they care about. Git context (base commit, diff, HEAD) is now always inferred from the current directory; pass `--baseSha` / `--gitDiffOutput` / `--commitSha` explicitly if you need to override it, or run the command from the directory itself.

### Patch Changes

- [#10618](https://github.com/alwaysmeticulous/meticulous/pull/10618) [`ae26bff`](https://github.com/alwaysmeticulous/meticulous/commit/ae26bff26f73209ff0ea4fca2b014d094be344d6) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Reordered the `agent js-coverage` / `agent js-coverage-diff` flags (and the corresponding `TestRunJsCoverageOptions` / `getReplayJsCoverage` / `getReplayDiffJsCoverage` option fields) so `--includeAllFiles` and `--globFilter` are grouped together ahead of the column-selection flags (`--includeExecutedRanges`, `--includeExecutableRanges`, `--includeUncoveredRanges`, `--includeCoveragePercentage`, `--prDiffOnly`), consistently across the CLI `--help` output and the client's TypeScript option types. No behavior change — request/response shapes and defaults are unchanged.

- [#10618](https://github.com/alwaysmeticulous/meticulous/pull/10618) [`ae26bff`](https://github.com/alwaysmeticulous/meticulous/commit/ae26bff26f73209ff0ea4fca2b014d094be344d6) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Fixed two gaps in `agent trigger-test-run`'s git diff inference left by `--commitSha` support ([#10586](https://github.com/alwaysmeticulous/meticulous/issues/10586)): a `--commitSha=<sha>` trigger now computes its diff against `<sha>` instead of local HEAD (previously the diff could mismatch the commit the run actually executed), and an explicit `--baseSha` (in both `--commitSha` and `--deploymentId` modes) now infers and attaches a diff instead of attaching none — so every custom trigger carries a diff for Relevant Session Execution unless `--gitDiffOutput` is passed explicitly. Also: the "nothing to test" short-circuit no longer fires for `--deploymentId` triggers (an empty locally-inferred diff there doesn't prove the backend has nothing to run), and a failure computing the diff (e.g. `--commitSha` not present in local git history) now raises a clear error instead of a raw git failure.

- [#10607](https://github.com/alwaysmeticulous/meticulous/pull/10607) [`950002e`](https://github.com/alwaysmeticulous/meticulous/commit/950002e88fa27063fb1cb3d631052cbfd6dbd8bb) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Point non-interactive auth error messages at `meticulous auth login --non-interactive`. `meticulous replay` now resolves its token via the same shared, full auth-chain check as other commands (previously it only checked `--apiToken` in non-interactive mode, ignoring `METICULOUS_API_TOKEN`/stored OAuth/config-file tokens), and skips auth entirely for `--dryRun`.

- [#10601](https://github.com/alwaysmeticulous/meticulous/pull/10601) [`b476745`](https://github.com/alwaysmeticulous/meticulous/commit/b4767459038d4e8374f9eecb7e0233f678ca2658) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Refresh the OAuth access token during OAuth-authenticated CLI commands. Commands that resolved an OAuth token and then baked it into the client via `createClient` would start returning `403 Forbidden` once the short-lived access token expired part-way through the command (e.g. `record session` notifications, container/asset uploads, debug sessions). They now build the client via `createClientWithOAuth`, which refreshes the token per request via the stored refresh token — matching the other OAuth-authenticated commands. Static/project API tokens are unaffected (they are still used as-is). Affects `record session`, `record login`, `agent test-run-diffs`, `agent js-coverage`, `agent test-run-for-commit`, `ci upload-container`, `ci upload-assets`, `ci run-with-uploaded-asset-chunks`, `debug`, `local relevant-sessions`, `project show`, `auth set-project`, and the OAuth path of `auth whoami`.

- Updated dependencies [[`879b04e`](https://github.com/alwaysmeticulous/meticulous/commit/879b04eac5966890f2b0d6f2aabf1ae139782f8d), [`ae26bff`](https://github.com/alwaysmeticulous/meticulous/commit/ae26bff26f73209ff0ea4fca2b014d094be344d6), [`950002e`](https://github.com/alwaysmeticulous/meticulous/commit/950002e88fa27063fb1cb3d631052cbfd6dbd8bb)]:
  - @alwaysmeticulous/client@2.304.0
  - @alwaysmeticulous/remote-replay-launcher@2.304.0
  - @alwaysmeticulous/debug-workspace@2.304.0
  - @alwaysmeticulous/downloading-helpers@2.304.0
  - @alwaysmeticulous/replay-orchestrator-launcher@2.304.0

## 2.303.1

### Patch Changes

- [#10583](https://github.com/alwaysmeticulous/meticulous/pull/10583) [`70489b8`](https://github.com/alwaysmeticulous/meticulous/commit/70489b84ddf961478be50302817644b10c6db527) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent trigger-test-run` no longer refuses to run when `--baseSha`
  equals the head commit (e.g. running locally on the default branch with no
  new commits) if `--sessionIds` is also passed. Such a request is treated as a
  deliberate "check these specific sessions against the current code" run and
  proceeds head-only, with no base comparison, instead of failing with "Base SHA
  equals head SHA and there are no changes to test — nothing to do."
- Updated dependencies [[`5ae77f3`](https://github.com/alwaysmeticulous/meticulous/commit/5ae77f305b7cbd59174f7e5e73c454ece794099f), [`849c5bc`](https://github.com/alwaysmeticulous/meticulous/commit/849c5bc94d20ee80bf96d4f411c670212ad58982)]:
  - @alwaysmeticulous/client@2.303.1
  - @alwaysmeticulous/debug-workspace@2.303.1
  - @alwaysmeticulous/sdk-bundles-api@2.303.1
  - @alwaysmeticulous/downloading-helpers@2.303.1
  - @alwaysmeticulous/remote-replay-launcher@2.303.1
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/replay-debugger-ui@2.283.1
  - @alwaysmeticulous/replay-orchestrator-launcher@2.303.1

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
