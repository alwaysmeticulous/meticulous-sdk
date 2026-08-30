# @alwaysmeticulous/client

## 2.336.0

### Minor Changes

- [#12944](https://github.com/alwaysmeticulous/meticulous/pull/12944) [`1b407f1`](https://github.com/alwaysmeticulous/meticulous/commit/1b407f19cd41dc9ada905904facc2dc5e42eb321) Thanks [@OCzarnecki](https://github.com/OCzarnecki)! - `ci run-with-uploaded-asset-chunks` now exits with code 4, rather than the generic 1, when `--sessionFilter` excludes every session that would otherwise have been replayed, so a pipeline can tell "nothing to test" apart from a real failure.

- [#12954](https://github.com/alwaysmeticulous/meticulous/pull/12954) [`37009f7`](https://github.com/alwaysmeticulous/meticulous/commit/37009f71b2f4b0d938ddb55d03826d1387f2a200) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Expose bounded Agent Review project-memory candidates on run result blobs.

### Patch Changes

- [#12907](https://github.com/alwaysmeticulous/meticulous/pull/12907) [`18b7686`](https://github.com/alwaysmeticulous/meticulous/commit/18b7686edfa667c07d6e4e93485f181ba4614f38) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Report `actionEndTimestampMs` on agentic review steps so a player can pace the action separately from the wait for its verification screenshot.

- Updated dependencies [[`f17af6e`](https://github.com/alwaysmeticulous/meticulous/commit/f17af6e22eef995d432d1c4fabbc278e6ea32743), [`f4c8e15`](https://github.com/alwaysmeticulous/meticulous/commit/f4c8e15932d055ef966a3686c811f1f9b4ee56e1), [`eae72ee`](https://github.com/alwaysmeticulous/meticulous/commit/eae72ee83b3e39a41ecef63fab4f9d9773a45f48)]:
  - @alwaysmeticulous/api@2.336.0
  - @alwaysmeticulous/common@2.336.0

## 2.335.0

### Minor Changes

- [#12892](https://github.com/alwaysmeticulous/meticulous/pull/12892) [`62e6413`](https://github.com/alwaysmeticulous/meticulous/commit/62e6413d589fafce57a9ad82c70adebe845f533a) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add optional inclusive line ranges to Agent Review repository file reads.

### Patch Changes

- [#12905](https://github.com/alwaysmeticulous/meticulous/pull/12905) [`313c3fa`](https://github.com/alwaysmeticulous/meticulous/commit/313c3faf3ea263bd1226fa1fff63e6f0e538abdc) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Let the asset and container upload paths report how they resolved the base, so a run that ends up with no base can be explained from the backend logs rather than from the customer's CI log.

## 2.334.0

### Patch Changes

- Updated dependencies [[`a169be3`](https://github.com/alwaysmeticulous/meticulous/commit/a169be364e19cda80cd24b21181ab3c373ba59a0)]:
  - @alwaysmeticulous/api@2.334.0
  - @alwaysmeticulous/common@2.333.1

## 2.333.1

### Patch Changes

- [#12849](https://github.com/alwaysmeticulous/meticulous/pull/12849) [`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op patch release of every public package.

- Updated dependencies [[`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df)]:
  - @alwaysmeticulous/api@2.333.1
  - @alwaysmeticulous/common@2.333.1

## 2.333.0

### Minor Changes

- [#12825](https://github.com/alwaysmeticulous/meticulous/pull/12825) [`6836d5a`](https://github.com/alwaysmeticulous/meticulous/commit/6836d5a2afbf41c60a27fe4e07ff29121bc555cd) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add a `no-diff` agentic not-testable category, used when the commit under test has no pull request and so no changed behaviour to review.

## 2.332.0

### Patch Changes

- [#12700](https://github.com/alwaysmeticulous/meticulous/pull/12700) [`c403e95`](https://github.com/alwaysmeticulous/meticulous/commit/c403e9599fb890e205c15d08174a06b0644f1c94) Thanks [@sesajad](https://github.com/sesajad)! - Return the backend-minted `agenticRunId` for agentic session generation launches instead of the legacy workflow run id.

- [#12665](https://github.com/alwaysmeticulous/meticulous/pull/12665) [`3624196`](https://github.com/alwaysmeticulous/meticulous/commit/362419699ae036afb7195cc0e47c972df2210b4d) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add `takeBaseWorkflowDispatchLease`, which asks the backend whether this caller should be the one to dispatch a build of a base commit when several callers may be about to build the same one.

- [#12808](https://github.com/alwaysmeticulous/meticulous/pull/12808) [`2f7c1ef`](https://github.com/alwaysmeticulous/meticulous/commit/2f7c1ef0692096323d0e74587c8fb1f798c62432) Thanks [@adrikoz](https://github.com/adrikoz)! - `meticulous onboard` now opens a browser sign-in when you are not logged in, instead of asking you to run `auth login` first. The OAuth page for that flow omits the agent-facing steps shown on the ordinary sign-in wall.

- [#12808](https://github.com/alwaysmeticulous/meticulous/pull/12808) [`2f7c1ef`](https://github.com/alwaysmeticulous/meticulous/commit/2f7c1ef0692096323d0e74587c8fb1f798c62432) Thanks [@adrikoz](https://github.com/adrikoz)! - The OAuth callback success page no longer prints the "set Meticulous up for your coding agent" steps (install the CLI, add the MCP server, `npx skills add`) when the login came from `meticulous onboard`. That run installs those itself, so the steps contradicted the run in progress. The plain `auth login` flow is unchanged.

- Updated dependencies [[`b7dde7f`](https://github.com/alwaysmeticulous/meticulous/commit/b7dde7f8f95bddb959fe548610762864dd67f63d), [`b7dde7f`](https://github.com/alwaysmeticulous/meticulous/commit/b7dde7f8f95bddb959fe548610762864dd67f63d), [`a6943e7`](https://github.com/alwaysmeticulous/meticulous/commit/a6943e7d1519193a2958a3129091f6bc80abe8a4), [`65a40b1`](https://github.com/alwaysmeticulous/meticulous/commit/65a40b11a270fd5acfad66d6418140dee1426f10)]:
  - @alwaysmeticulous/api@2.332.0
  - @alwaysmeticulous/common@2.332.0

## 2.331.2

### Patch Changes

- [#12669](https://github.com/alwaysmeticulous/meticulous/pull/12669) [`be6e14a`](https://github.com/alwaysmeticulous/meticulous/commit/be6e14aeee646706157e728d1fbf325e659ef23d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Serve a base run's coverage when a small share of its selected set can never be replayed, rather than refusing that commit permanently. `agent complete-base-run` reports `unobtainableSessionCount`, and stops waiting for sessions nothing will retry.

- [#12669](https://github.com/alwaysmeticulous/meticulous/pull/12669) [`be6e14a`](https://github.com/alwaysmeticulous/meticulous/commit/be6e14aeee646706157e728d1fbf325e659ef23d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Align base-run completion with coverage readiness, and keep commit lookup output limited to the test run id and status.

## 2.331.1

### Patch Changes

- [#12634](https://github.com/alwaysmeticulous/meticulous/pull/12634) [`c7a028b`](https://github.com/alwaysmeticulous/meticulous/commit/c7a028b28300ee2e4cef43a9a2b396828b3f76c0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Retry incomplete Docker image pushes and include backend container-upload diagnostics in client errors.

## 2.331.0

### Minor Changes

- [#12543](https://github.com/alwaysmeticulous/meticulous/pull/12543) [`819647c`](https://github.com/alwaysmeticulous/meticulous/commit/819647c71df1e983a33a1e75f00dbd7d34c7c883) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `meticulous ci agent-test` now forwards every `METICULOUS_STAGING_*` environment variable to the project's configured login flow as a generic login-option map, so new login options no longer require a CLI upgrade. This includes the new `METICULOUS_STAGING_SKIP_EMAIL_CLIENT_ID`: a trusted-automation client id passed to the staging app's login page (as `skipEmailClientId` in the login URL) so the agentic totp login flow can bypass an email device-verification challenge the worker cannot answer.

### Patch Changes

- [#12550](https://github.com/alwaysmeticulous/meticulous/pull/12550) [`cf1dc40`](https://github.com/alwaysmeticulous/meticulous/commit/cf1dc4061871eeb3bd14bb085743fdb7b084e3e7) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Expose when a recorded request search result is a near match.

- [#12551](https://github.com/alwaysmeticulous/meticulous/pull/12551) [`5f64efb`](https://github.com/alwaysmeticulous/meticulous/commit/5f64efb034e5880e5f78164a974389b54d616061) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Expose whether an agent review case was blocked by the application or test environment.

- Updated dependencies []:
  - @alwaysmeticulous/common@2.326.0

## 2.330.0

### Minor Changes

- [#12368](https://github.com/alwaysmeticulous/meticulous/pull/12368) [`4300670`](https://github.com/alwaysmeticulous/meticulous/commit/43006703e6c4da1cc646bfe2cd6e501882f36daf) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - New `agent complete-base-run` command (and `complete_base_run` MCP tool): replays the selected sessions a base run has not run yet, to complete its coverage information. A base run replays sessions on demand for whichever PRs compare against it, so it can sit at any fraction of the project's selected set. `agent js-coverage` now refuses such a run, saying how many sessions are missing, instead of reporting an understated total — complete the run, or pass `--latestForProject` for the project's overall coverage.

### Patch Changes

- [#12493](https://github.com/alwaysmeticulous/meticulous/pull/12493) [`f3f3a5c`](https://github.com/alwaysmeticulous/meticulous/commit/f3f3a5caac23c71252b66df2898fd889fc549d70) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Adds `reportAgenticRunFailure`, the agentic worker's dying report: it moves the
  run to a terminal `failed` status with the error that killed it, so a crashed
  run surfaces immediately instead of sitting `scheduled`/`running` until the
  backend's staleness reaper times it out.
- Updated dependencies []:
  - @alwaysmeticulous/common@2.326.0

## 2.328.0

### Minor Changes

- [#12458](https://github.com/alwaysmeticulous/meticulous/pull/12458) [`bc8ff00`](https://github.com/alwaysmeticulous/meticulous/commit/bc8ff00296dbee5ee25386a1b9b7b1252dfca8b9) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add `--appPort` to `meticulous ci agent-test` so uploaded-assets agentic runs serve the frontend on a stable origin (`http://localhost:8000` by default) that staging CORS allowlists can pin.

- [#12434](https://github.com/alwaysmeticulous/meticulous/pull/12434) [`4fb60b8`](https://github.com/alwaysmeticulous/meticulous/commit/4fb60b8d04fa0f122609efe3ab99a4462ca83f27) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add `--trustedOrigins` to `ci agent-test` so uploaded-assets agentic runs can allowlist extra HTTPS origins that the frontend calls with absolute cross-origin URLs.

- [#12405](https://github.com/alwaysmeticulous/meticulous/pull/12405) [`6a97671`](https://github.com/alwaysmeticulous/meticulous/commit/6a976713186d6592cdc1867d6451328cb51870cd) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Agentic run result steps can now name (part of) their URL as the step's evidence. `AgenticRunResultStep` gains `urlHighlightRange` — a character range into the step's verification route group, resolved by the worker from the substring the agent reported — plus the worker-internal `urlHighlight` it is resolved from. Both are optional, so blobs written by older workers read unchanged and `AGENTIC_RESULT_VERSION` is not bumped.

- [#12391](https://github.com/alwaysmeticulous/meticulous/pull/12391) [`77b0b49`](https://github.com/alwaysmeticulous/meticulous/commit/77b0b49662720e5a7fb459cb73e306915b7da6b5) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `MeticulousClient`'s methods now resolve to `Response<T>` rather than a return type the caller names. The `R` type parameter was implemented as an unchecked cast, so a call site could assert any return type and still receive the response envelope at runtime. Type parameters now read response-first, request-body-second on all four methods: `get<TestRun>(url)` in place of `get<unknown, { data: TestRun }>(url)`, and `post<Res, Req>(url, body)` where the request type is worth naming.

  **Migration note:** this is a breaking type change for direct callers of `MeticulousClient`. A two-generic call like `client.get<unknown, { data: TestRun }>(url)` no longer compiles. More importantly, `client.post<RequestBody>(url, body)` still compiles but now types the _response_ as `RequestBody` instead of the request — that single-generic form was previously used to name the request body, and must be dropped or moved to the second parameter (`client.post<ResponseBody, RequestBody>(url, body)`).

## 2.327.0

### Patch Changes

- Updated dependencies [[`18f08df`](https://github.com/alwaysmeticulous/meticulous/commit/18f08df1169dadd792e1b20308e092e5611a2c79), [`ea7d1b4`](https://github.com/alwaysmeticulous/meticulous/commit/ea7d1b40ec04a6e876d9312e8d2385dc619c4e93)]:
  - @alwaysmeticulous/api@2.327.0
  - @alwaysmeticulous/common@2.326.0

## 2.326.0

### Minor Changes

- [#12052](https://github.com/alwaysmeticulous/meticulous/pull/12052) [`00066d3`](https://github.com/alwaysmeticulous/meticulous/commit/00066d3f830390c2df1227044bc172789abba7da) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Agent Review runs can now report that a pull request has no browser-exercisable changes, including a category and evidence-backed reason.

- [#12232](https://github.com/alwaysmeticulous/meticulous/pull/12232) [`d4b5a1e`](https://github.com/alwaysmeticulous/meticulous/commit/d4b5a1e52e37e5ff6e20a7dba7f6894285ce7f3b) Thanks [@sesajad](https://github.com/sesajad)! - Added `searchRecordedRequests` and `getRecordedRequest`, which look up a project's recorded requests by request shape — the same fuzzy hash network patching uses — and read one back in full. Matching ignores values and query strings and considers only structure (for GraphQL the operation names, variable names and field paths; otherwise the top-level keys of the JSON body), so an exemplar with placeholder ids still matches the recorded request.

- [#12145](https://github.com/alwaysmeticulous/meticulous/pull/12145) [`84feae7`](https://github.com/alwaysmeticulous/meticulous/commit/84feae7f6b335a4445206b6c17a7168cbbcfded2) Thanks [@sesajad](https://github.com/sesajad)! - Add canonical route-group metadata to agentic result screenshot evidence.

- [#12085](https://github.com/alwaysmeticulous/meticulous/pull/12085) [`c810f6f`](https://github.com/alwaysmeticulous/meticulous/commit/c810f6f58ae213f9d3d878f3f9f9c2bcfa9b94a5) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Agentic run result steps can include a user-friendly reason explaining failed or blocked outcomes.

- [#12123](https://github.com/alwaysmeticulous/meticulous/pull/12123) [`88d0868`](https://github.com/alwaysmeticulous/meticulous/commit/88d086862afbf39bb24f798566ca67981220b12b) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent test-run-check` (MCP: `get_test_run_check`) now caps how much of a report it returns inline. A report over the cap returns a short notice plus a `url` to download the full report, instead of the full text — the CLI prints the notice and the URL on the plain-text path, and both are available as `text`/`url` with `--json`.

- [#11580](https://github.com/alwaysmeticulous/meticulous/pull/11580) [`ac2e48b`](https://github.com/alwaysmeticulous/meticulous/commit/ac2e48b1b28f3c3fa361d31e4aaa3582ffb96055) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Support a server-driven extension of the base polling window. When a run is triggered with `--waitForBase` and no base exists yet, `baseNotFound` responses can now carry an `extraBasePollTimeoutMs` hint (set per project via a backend feature flag); `pollWhileBaseNotFound` adds it to its default 5-minute window, re-reading the hint on every retry. Responses without the hint behave exactly as before.

- [#12212](https://github.com/alwaysmeticulous/meticulous/pull/12212) [`bca9805`](https://github.com/alwaysmeticulous/meticulous/commit/bca980587b44e428c9a4f5c3e84b9af1ee9041c7) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `TestRun.configData` and `getTestRunForCommit`'s response now expose whether a run is a lazy session-pool base — which can settle into `Success`/`Failure` without ever passing through `Partial`. `meticulous agent test-run-diffs`, `test-run-check`, and `js-coverage --prDiffOnly` now reject any session-pool run client-side, matching the backend's rejection for these commands (previously the CLI's own pre-check only caught one still `Partial`; a session-pool run that had settled still reached the server and was correctly rejected there, just via a round trip instead of instantly). This includes a session-pool run that also triggered eager session selection on a main-branch push — its diffs/checks/PR-diff-scoped coverage are not reachable through these three commands even though it represents a change of its own; plain (non-`prDiffOnly`) `js-coverage` is unaffected and continues to serve any session-pool run's coverage normally.

- [#12064](https://github.com/alwaysmeticulous/meticulous/pull/12064) [`abd232d`](https://github.com/alwaysmeticulous/meticulous/commit/abd232db2372fa03babc4cda95f683256e116053) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous agent test-run-checks` is renamed to `meticulous agent test-run-check` (MCP: `get_test_run_check`), since it operates on a single check; the client's exported `getTestRunCheckReport` is unaffected but the CLI command name changed. The new `--availableIds` flag on `test-run-check` (MCP: `get_test_run_check_available_ids`) lists the check IDs that have reported results for a test run, exposed on the client as `getTestRunCheckAvailableIds`.

### Patch Changes

- [#12149](https://github.com/alwaysmeticulous/meticulous/pull/12149) [`e369a5a`](https://github.com/alwaysmeticulous/meticulous/commit/e369a5af5f90fca48bdfdd7adecc7908bd7472d3) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Allow agentic review steps to choose distinct highlight selectors for a shared explicit screenshot (`highlight` / `beforeHighlight` on `AgenticRunResultStep`), so adjacent steps can reuse one image without inheriting the same highlight region.

- [#11995](https://github.com/alwaysmeticulous/meticulous/pull/11995) [`04c8bc7`](https://github.com/alwaysmeticulous/meticulous/commit/04c8bc7258c2ea2055651e029b6ee5d762d87a0b) Thanks [@sesajad](https://github.com/sesajad)! - Add `requestAgenticProgressUpload` and the `AgenticRunProgressSnapshot` types: the agentic session generation worker now streams a throttled per-case progress snapshot to S3 (overwriting `progress.json` next to the run's artifacts) from the moment its plan exists until it reports its terminal result.

- [#11650](https://github.com/alwaysmeticulous/meticulous/pull/11650) [`654b4c5`](https://github.com/alwaysmeticulous/meticulous/commit/654b4c5bfac3bd4c94c63eaecf804b1231980c97) Thanks [@claude](https://github.com/apps/claude)! - Add agent setup steps to the OAuth login success page: the CLI install command or, alternatively, the MCP server URL, then the agent skills install command, and a link to the agent setup docs

- [#12186](https://github.com/alwaysmeticulous/meticulous/pull/12186) [`cbb227c`](https://github.com/alwaysmeticulous/meticulous/commit/cbb227c3fe7df7fa4d01f02b4b425fb012c1b62b) Thanks [@sesajad](https://github.com/sesajad)! - Allow configured agentic staging logins to receive a CI-supplied TOTP secret.

- Updated dependencies [[`f1c9afa`](https://github.com/alwaysmeticulous/meticulous/commit/f1c9afaf7d88f35487ed7e625dccebc930a90ee2), [`e31cd70`](https://github.com/alwaysmeticulous/meticulous/commit/e31cd700185109bf0591167fa0a28c7dfda25742), [`bc5e33d`](https://github.com/alwaysmeticulous/meticulous/commit/bc5e33df47f22fc88fe956b4c1202163dc4fa813), [`bca9805`](https://github.com/alwaysmeticulous/meticulous/commit/bca980587b44e428c9a4f5c3e84b9af1ee9041c7)]:
  - @alwaysmeticulous/common@2.326.0
  - @alwaysmeticulous/api@2.326.0

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

- [#12021](https://github.com/alwaysmeticulous/meticulous/pull/12021) [`8e26cb9`](https://github.com/alwaysmeticulous/meticulous/commit/8e26cb9de09cdd8c90db9b1c187c87fd3becf913) Thanks [@calebgcc](https://github.com/calebgcc)! - `meticulous download replay` now also fetches the replay's `app-container-logs.ndjson` when one exists. Most replays have no such artifact, and the server omits the key entirely in that case, so the download is unchanged for them. `getReplayV3DownloadUrls` gains an opt-in `includeAppContainerLogs` option for callers that want the artifact located.

- Updated dependencies []:
  - @alwaysmeticulous/common@2.324.0

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

- [#11871](https://github.com/alwaysmeticulous/meticulous/pull/11871) [`b89a9e8`](https://github.com/alwaysmeticulous/meticulous/commit/b89a9e82013b34552b044443b80e65c297f8c487) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add an optional evidence-backed diagnosis to agentic run result cases.

- [#11805](https://github.com/alwaysmeticulous/meticulous/pull/11805) [`2f1c1cc`](https://github.com/alwaysmeticulous/meticulous/commit/2f1c1cc6dce21dd4ac39b58936ed0993e944e1f5) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `AgenticRunResultStep` now carries optional `actionIds` plus before/after screenshot paths and highlight regions for automatic action capture. Explicit verification still uses `screenshotPath` / `highlightRegion`; older single pre-action frames are exposed as `legacyActionScreenshot*` fields.

- [#11905](https://github.com/alwaysmeticulous/meticulous/pull/11905) [`71dae8b`](https://github.com/alwaysmeticulous/meticulous/commit/71dae8b638e96c9c8f0c642f79df2c89ceb4b4ea) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Project-scoped commands that come back empty (`agent test-run-for-commit`, `agent sessions`, and every command that resolves a test run from a commit) now name the project they searched and how to change it, since an unexpectedly empty result is usually the wrong project rather than missing data.

  `auth get-project` and `auth set-project` gained `--json`, and `auth whoami --json` now reports the token's project under `selectedProject` (the key its OAuth output already used, and the one the matching MCP tool uses) — `pinnedProject` remains as a deprecated alias. The four `auth` commands now resolve through `agent/whoami`, `agent/projects` and `agent/project` rather than the `oauth/*` endpoints the CLI also uses internally, so each command is one request; their output is unchanged.

- [#11877](https://github.com/alwaysmeticulous/meticulous/pull/11877) [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add agent CLI and client support for retrieving builtin and custom non-visual check reports.

- Updated dependencies [[`daf7259`](https://github.com/alwaysmeticulous/meticulous/commit/daf72590468aee89a73dea858d003efe41385b75), [`297a0f5`](https://github.com/alwaysmeticulous/meticulous/commit/297a0f57c2acbb26e48c8f346b463f240212941f), [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297)]:
  - @alwaysmeticulous/common@2.324.0
  - @alwaysmeticulous/api@2.324.0

## 2.323.0

### Minor Changes

- [#11727](https://github.com/alwaysmeticulous/meticulous/pull/11727) [`583b59c`](https://github.com/alwaysmeticulous/meticulous/commit/583b59c9d32fa3c21575765f8475a00f315d7b1d) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add pre-action screenshot paths and highlight regions to agentic run result steps, allowing reviewers to inspect the targeted element before an interaction alongside its post-action state.

- [#11673](https://github.com/alwaysmeticulous/meticulous/pull/11673) [`a579631`](https://github.com/alwaysmeticulous/meticulous/commit/a579631e702203e78c81435b43162efec60893cf) Thanks [@sesajad](https://github.com/sesajad)! - `AgenticRunResultBlob` now carries a top-level `version`, so a reader holding only the document can tell whether it can interpret it. The redundant `version` fields on `AgenticRunSummary` and `AgenticRunTraces` are removed — the document's version now covers them.

- [#11707](https://github.com/alwaysmeticulous/meticulous/pull/11707) [`15c3c0a`](https://github.com/alwaysmeticulous/meticulous/commit/15c3c0a1d173992db7963bf7f6bfc00831d26157) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add concise agentic case outcome summaries and distinguish cases skipped by execution limits from behavioral failures and blockers.

- [#11661](https://github.com/alwaysmeticulous/meticulous/pull/11661) [`0ef2f27`](https://github.com/alwaysmeticulous/meticulous/commit/0ef2f27855381b29551b3f7b90ac92b6ed03e92d) Thanks [@sesajad](https://github.com/sesajad)! - Agentic run results are now uploaded straight to S3 through a presigned URL rather than POSTed inline. `reportAgenticRunResult` is replaced by `requestAgenticResultUpload` followed by `completeAgenticRunResult`, and the uploaded document's shape is exported as `AgenticRunResultBlob`.

- [#11757](https://github.com/alwaysmeticulous/meticulous/pull/11757) [`672e710`](https://github.com/alwaysmeticulous/meticulous/commit/672e710e504b843d84ea0dae85612390b2b0ad26) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add screenshot content hashes to agentic run result steps so reviewers can identify duplicate visual evidence across different artifact paths.

- [#11715](https://github.com/alwaysmeticulous/meticulous/pull/11715) [`fed0068`](https://github.com/alwaysmeticulous/meticulous/commit/fed00687ed753102ecaad6e5f5aabbf089e5e9f1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Return all diffs by default when there are at most five, apply representative selection above that threshold (falling back to every matching diff for `--onlyUnreviewed` if the representative subset has already been fully reviewed), expose response-level `selectionApplied` metadata, and remove `isSelected` from current full-diff results. `--onlyRejected`/`--onlyWithComments` are unaffected by the cap and always return every matching diff.

- [#11653](https://github.com/alwaysmeticulous/meticulous/pull/11653) [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add a terminal `Skipped` test run status for runs that deliberately do not execute (e.g. when no base test run is available). The client sends a `clientVersion` on `getTestRun` so the backend can return `Skipped` to new clients and downgrade it to `Aborted` for pinned older CLIs.

### Patch Changes

- [#11522](https://github.com/alwaysmeticulous/meticulous/pull/11522) [`4c2c367`](https://github.com/alwaysmeticulous/meticulous/commit/4c2c367837bd717fcaa471730b3ac8c9224766d8) Thanks [@sesajad](https://github.com/sesajad)! - Add the API surface for persistent agentic testcases: `requestAgenticTestcasesUpload` presigns the run's testcase bundle (the verbatim code of every testcase, which the next run on the same PR inherits as its baseline), and the run result now carries per-testcase `provenance`.

- [#11689](https://github.com/alwaysmeticulous/meticulous/pull/11689) [`2c15475`](https://github.com/alwaysmeticulous/meticulous/commit/2c15475d9661cd496699f07901fd487800b717d1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `onlyWithComments` to `agent test-run-diffs`, the client API, and the hosted MCP tool, and report `numWithOpenComments` in the `--counts` totals.

  Multiple `only*` row filters now combine as a union: a difference is returned if it matches any enabled filter, so combining them widens the result rather than narrowing it. Requesting `onlyUnreviewed` together with `onlyRejected` previously failed with a `400` / `CliUserError`; that error is gone and the pair now returns both sets, so a caller that was relying on it to catch a mis-set flag pair gets a larger result instead.

- Updated dependencies [[`54741e1`](https://github.com/alwaysmeticulous/meticulous/commit/54741e1ab73a0e2ffa40e59eb7a0f8340b309095), [`8346ef7`](https://github.com/alwaysmeticulous/meticulous/commit/8346ef7ff80d1e24f1ce692a61789083a0cb187e), [`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c)]:
  - @alwaysmeticulous/common@2.323.0
  - @alwaysmeticulous/api@2.323.0

## 2.322.0

### Minor Changes

- [#11624](https://github.com/alwaysmeticulous/meticulous/pull/11624) [`57c6f62`](https://github.com/alwaysmeticulous/meticulous/commit/57c6f6231fee758b3598d7e961d6422dbfb22b56) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Support companion assets when uploading a Docker container. Previously `--companionAssetsFolder`/`--companionAssetsZip`/`--companionAssetsRegex` only worked with `ci run-with-tunnel`; `ci upload-container` now accepts the same flags, plus a new `--companionAssetsPathInImage` to serve a bundle straight out of a path inside the uploaded image itself, with no local copy needed.

## 2.321.0

### Minor Changes

- [#11571](https://github.com/alwaysmeticulous/meticulous/pull/11571) [`064702f`](https://github.com/alwaysmeticulous/meticulous/commit/064702f02963eff44863ea6676c015e60e5276c1) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add open review-comment counts to test-run diffs and add diff-comments CLI/MCP retrieval with nested replies, with resolved comments available on request. Share exact JSON serialization between CLI and MCP outputs.

- [#11574](https://github.com/alwaysmeticulous/meticulous/pull/11574) [`b5b2c6b`](https://github.com/alwaysmeticulous/meticulous/commit/b5b2c6ba1b85d3e5c8090802b9c947bcb98a5734) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Simplify `agent test-run-diffs` output by removing redundant `index` and `outcome` fields and making `mismatchFraction` opt-in via `--includeMismatchFraction`. This also changes `getTestRunDiffsSummary`'s return type in `@alwaysmeticulous/client`: `DiffsSummaryResponse.data` is now `DiffsSummaryDiff[]` (a flat `{ replayDiffId, screenshotName, ... }` list) instead of the nested `DiffsSummaryReplayDiff[]` (one entry per replay diff, each with a `screenshots` array) — a compile break for any direct caller of `getTestRunDiffsSummary`.

- [#11570](https://github.com/alwaysmeticulous/meticulous/pull/11570) [`3096d56`](https://github.com/alwaysmeticulous/meticulous/commit/3096d56bbb7341fd2af918050bf59496b9a57e28) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add an `--onlyRejected` filter to `agent test-run-diffs` and the corresponding `onlyRejected` option to the client API. The hosted `get_test_run_diffs` MCP tool now exposes the same filter.

### Patch Changes

- Updated dependencies [[`3529e08`](https://github.com/alwaysmeticulous/meticulous/commit/3529e081dc13602a463e3d47c64b674316777722), [`064702f`](https://github.com/alwaysmeticulous/meticulous/commit/064702f02963eff44863ea6676c015e60e5276c1)]:
  - @alwaysmeticulous/api@2.321.0
  - @alwaysmeticulous/common@2.321.0

## 2.320.0

### Minor Changes

- [#11597](https://github.com/alwaysmeticulous/meticulous/pull/11597) [`70bac9c`](https://github.com/alwaysmeticulous/meticulous/commit/70bac9c3859ae034b3acccc059323cdc313b1873) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add agent-written summary takeaways to agentic run results.

## 2.319.0

### Minor Changes

- [#11548](https://github.com/alwaysmeticulous/meticulous/pull/11548) [`539f672`](https://github.com/alwaysmeticulous/meticulous/commit/539f672e598db9270ac5014dc43632a08b827fa5) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add optional per-step outcomes and screenshot highlight regions to agentic run results.

### Patch Changes

- Updated dependencies [[`46fce61`](https://github.com/alwaysmeticulous/meticulous/commit/46fce6165d356e006bd432c16c194034cce4b7c9), [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b)]:
  - @alwaysmeticulous/api@2.319.0
  - @alwaysmeticulous/common@2.310.0

## 2.318.0

### Minor Changes

- [#11553](https://github.com/alwaysmeticulous/meticulous/pull/11553) [`d9267a0`](https://github.com/alwaysmeticulous/meticulous/commit/d9267a01c67a677f21f1d7e3dcdf4936633d6616) Thanks [@claude](https://github.com/apps/claude)! - Add `meticulous ci label-commit` command (and `labelCommit` client API) for attaching labels to commits. The only supported label for now is `not-relevant`, which marks a commit as not affecting the app under test so base test run resolution can skip over it when looking for a test run to compare against.

### Patch Changes

- [#11526](https://github.com/alwaysmeticulous/meticulous/pull/11526) [`8e70c70`](https://github.com/alwaysmeticulous/meticulous/commit/8e70c70c295cf5f34374a19b218b0711dd2ad260) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add optional `traces` to `AgenticRunResult`, carrying structured planner and per-case agent traces (`AgenticRunTraces`, `AgenticRunTrace`, `AgenticRunTraceEvent`, `AgenticRunTraceUsage`) reported by agentic-session-generation workers.

## 2.316.1

### Patch Changes

- [#11535](https://github.com/alwaysmeticulous/meticulous/pull/11535) [`4fa92e5`](https://github.com/alwaysmeticulous/meticulous/commit/4fa92e5017b750814239ecf2d10443b9dfd560ba) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add test type and feature group metadata to agentic run result cases.

- [#11430](https://github.com/alwaysmeticulous/meticulous/pull/11430) [`ee12bbe`](https://github.com/alwaysmeticulous/meticulous/commit/ee12bbea3fa268e30ac6bf6d335fbef694ee3287) Thanks [@sesajad](https://github.com/sesajad)! - Add `getAgenticRunCoverage`, which reads one agentic session generation run's edit-coverage (the executable and covered edited line ranges per file). The counterpart to `getTestRunJsCoverage` for the normal test run, so both sides of a PR's edited-line coverage can be read as data and compared over a shared denominator.

## 2.316.0

### Minor Changes

- [#11500](https://github.com/alwaysmeticulous/meticulous/pull/11500) [`6ba0dd6`](https://github.com/alwaysmeticulous/meticulous/commit/6ba0dd62bc7cba90c344e80b6167a2c1c3ee9e56) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `@alwaysmeticulous/client` gains `declareClientAppInfo(appInfo)`, which labels the `User-Agent` of every client the process subsequently creates — including clients built deep inside dependencies, which is why it goes through the environment rather than the `appInfo` option. An identity already present in the environment wins, so an outer consumer that labelled the process (e.g. a GitHub Action that then invokes the CLI) keeps its attribution.

  The CLI now calls it at the start of `main`, so requests made by a CLI command are labelled `cli`. This makes CLI traffic distinguishable from direct use of the client as a library: a process that declares nothing sends the bare client `User-Agent`, which is therefore the signature of code that imported the package and called it directly. Nothing changes for consumers that already set `appInfo` or `METICULOUS_CLIENT_USER_AGENT_SUFFIX`.

- [#11448](https://github.com/alwaysmeticulous/meticulous/pull/11448) [`061d6fb`](https://github.com/alwaysmeticulous/meticulous/commit/061d6fb0038caa690245acbbbe66248fe9386bef) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Allow container-based agentic PR tests to use recorded-session network mocks.

### Patch Changes

- [#11431](https://github.com/alwaysmeticulous/meticulous/pull/11431) [`b20dc05`](https://github.com/alwaysmeticulous/meticulous/commit/b20dc05866f60875b8589e4e8ac7837c07da542c) Thanks [@sesajad](https://github.com/sesajad)! - Add `isAgenticRunCancelled`, which reports whether an agentic session generation run has been cancelled (currently: superseded by a newer run for the same PR). The in-cluster worker polls it throughout a run and aborts its agent on the first `cancelled: true`, exiting without reporting a result.

- [#11482](https://github.com/alwaysmeticulous/meticulous/pull/11482) [`80151d6`](https://github.com/alwaysmeticulous/meticulous/commit/80151d63704a7acae0c157d112cb39825c1ce287) Thanks [@sesajad](https://github.com/sesajad)! - Narrow `AgenticRunResultCase.steps` to `AgenticRunResultStep[]`. Plain-string steps were the shape older agentic-session-generation workers reported; every current worker sends structured steps, and the backend now rejects strings.

- [#11449](https://github.com/alwaysmeticulous/meticulous/pull/11449) [`777bfaf`](https://github.com/alwaysmeticulous/meticulous/commit/777bfaf0c3c169a367b3bba7244973023a2908f3) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `meticulous crawl` now resolves auth the same way as other commands (explicit `--apiToken` → OAuth login → `METICULOUS_API_TOKEN` → legacy config file), so it honors `meticulous auth set-project` and prompts for a browser login when no credentials are stored, instead of silently recording into whatever project a legacy config-file token points at. Also fixes `--maxNumSessions` closing the browser before the manual-login prompt: the cap is now only enforced once crawling actually starts, and sessions recorded while logging in no longer count towards it.

- Updated dependencies []:
  - @alwaysmeticulous/common@2.310.0

## 2.315.0

### Minor Changes

- [#11388](https://github.com/alwaysmeticulous/meticulous/pull/11388) [`5931dfd`](https://github.com/alwaysmeticulous/meticulous/commit/5931dfd6fd798e1a45cf5f507005e71e9018396f) Thanks [@claude](https://github.com/apps/claude)! - Add a customer-facing `meticulous crawl` command. It crawls your app from a given start URL in a local headed browser — pausing first so you can manually log in — records the visited pages as sessions, and then creates a test run from them. Auth uses your project API token; the sessions and test run are always scoped to that project.

### Patch Changes

- [#11356](https://github.com/alwaysmeticulous/meticulous/pull/11356) [`62f456b`](https://github.com/alwaysmeticulous/meticulous/commit/62f456b0587d1fbed430e532b25bfabd7e2a4c93) Thanks [@sesajad](https://github.com/sesajad)! - Report agentic run edit-coverage in a compact, non-redundant per-file range shape. `AgenticRunCoverage` now carries `perFile: { path, executableEditedRanges, coveredEditedRanges }[]` + `unobservedFiles` (covered ⊆ executable), replacing the previous per-file counts + residual ranges. Aggregate counts, the fraction, and residual-uncovered ranges are derived by consumers via `@alwaysmeticulous/coverage-utils` helpers rather than transported redundantly.

- [#11354](https://github.com/alwaysmeticulous/meticulous/pull/11354) [`e021d1c`](https://github.com/alwaysmeticulous/meticulous/commit/e021d1c4d587c629f1d67a5deb85bb6243608505) Thanks [@sesajad](https://github.com/sesajad)! - Add optional `agenticRunId` to `reportAgenticRunResult` so the agentic session generation worker can echo back the run id the backend minted at launch, letting the backend update the exact run record (falling back to project + commit matching when absent).

- [#11380](https://github.com/alwaysmeticulous/meticulous/pull/11380) [`95053ea`](https://github.com/alwaysmeticulous/meticulous/commit/95053ea5c096a25076452e32ac9e8b07f8ce3fe7) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Report agentic runs with structured steps, screenshots and run metadata. `ReportAgenticRunResultCase.steps` now accepts `AgenticRunResultStep` objects (`description`, `kind`, optional `detail` and `screenshotPath`) alongside the plain strings it accepted before, `reportAgenticRunResult` takes optional `runMetadata` (`startedAt`, `finishedAt`, `model`, `iterations`), and the new `requestAgenticArtifactUploads` presigns PUT URLs so a run's referenced screenshots can be uploaded next to its result. `reportAgenticRunResult` now also returns `recorded`, telling the caller whether the result was actually persisted against a run.

- [#11325](https://github.com/alwaysmeticulous/meticulous/pull/11325) [`f3c5e3b`](https://github.com/alwaysmeticulous/meticulous/commit/f3c5e3b77edd8cd1cf9de3c1e28c308a86247a45) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Print the device-login verification URL on its own line so terminal URL detection and copy/paste don't truncate the query parameters.

- Updated dependencies []:
  - @alwaysmeticulous/common@2.310.0

## 2.314.0

### Minor Changes

- [#11328](https://github.com/alwaysmeticulous/meticulous/pull/11328) [`21b5979`](https://github.com/alwaysmeticulous/meticulous/commit/21b59793a2e0819f70062b544879abae43b023c9) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add `meticulous agent submit-feedback` (and the `submitAgentFeedback` client function) so AI coding agents can submit free-form feedback about Meticulous — whether it helped catch or debug a problem, what was confusing, and what information would have made their task easier — optionally tagged with an outcome, test run, skill, and agent name/model.

## 2.313.1

### Patch Changes

- [#11314](https://github.com/alwaysmeticulous/meticulous/pull/11314) [`47f4c67`](https://github.com/alwaysmeticulous/meticulous/commit/47f4c6784db1ef66a2a11a8806549909d38c227d) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Allow the CLI and client to proceed without an API token, omitting the Authorization header so environments that inject auth can work. On 401/403 responses when no token was sent, surface guidance that authentication is probably missing.

## 2.313.0

### Minor Changes

- [#11208](https://github.com/alwaysmeticulous/meticulous/pull/11208) [`3eaa104`](https://github.com/alwaysmeticulous/meticulous/commit/3eaa10473902958c66bc903bb98c3ad35bd10f6b) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add an uploaded-assets mode to agentic PR-time testing. The new `meticulous ci agent-test` command accepts exactly one of `--localImageTag`, `--assetsDir`, or `--assetsUploadId`, plus an optional `--backendUrl` pointing at a customer staging backend (credentials are read from `METICULOUS_STAGING_USERNAME` / `METICULOUS_STAGING_PASSWORD`, proxied path prefixes from `--backendProxyPaths`, default `/api`). With assets targets the agent worker serves the uploaded frontend itself and either reverse-proxies API calls to the staging backend or stubs them from recorded sessions when no backend is given. The client gains the `AgenticAppTarget` discriminated union (`container` / `assets`) and `AgenticAssetsBackend` types, and `remote-replay-launcher`'s `generateSessions` can now upload an assets directory (or reuse an existing upload) instead of a container image.

### Patch Changes

- [#11249](https://github.com/alwaysmeticulous/meticulous/pull/11249) [`b72db94`](https://github.com/alwaysmeticulous/meticulous/commit/b72db94c764ca46ee0bd2d71fe5b4c2e9a0ef05f) Thanks [@sesajad](https://github.com/sesajad)! - `GetAgenticChangedFilesResponse` now includes `baseSha`, the resolved PR base commit sha (already computed server-side to diff `changed-files`), so a caller that only has the head commit sha can call `getRelevantSessions`.

- [#11224](https://github.com/alwaysmeticulous/meticulous/pull/11224) [`474ad7e`](https://github.com/alwaysmeticulous/meticulous/commit/474ad7eaa1d2a4c072305af9e6ae8b419dd19046) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add `catalog-maintenance/*` API functions for the per-project session-mutation catalog-maintenance worker: `launchCatalogMaintenance` (submit a worker run), `getCatalogMaintenanceWorkflowStatus`, and `requestCatalogMaintenanceProposalUpload` (mint a size-pinned presigned PUT for the worker's proposal). All endpoints are project-API-token gated on the catalog-maintenance project setting.

- [#11224](https://github.com/alwaysmeticulous/meticulous/pull/11224) [`474ad7e`](https://github.com/alwaysmeticulous/meticulous/commit/474ad7eaa1d2a4c072305af9e6ae8b419dd19046) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add `session-transform-discovery/*` repo access API functions (`getDiscoveryRepoFile`, `searchDiscoveryRepoCode`, `listDiscoveryRepoTree`, and the `acquireDiscoveryRepoLease`/`getDiscoveryRepoLeaseStatus`/`heartbeatDiscoveryRepoLease`/`releaseDiscoveryRepoLease` lease lifecycle). Same request/response shapes as the agentic session-generation repo surface, served under a separate endpoint gated on the session-mutation catalog-maintenance project setting.

## 2.312.0

### Minor Changes

- [#11137](https://github.com/alwaysmeticulous/meticulous/pull/11137) [`a45a77f`](https://github.com/alwaysmeticulous/meticulous/commit/a45a77f8157baa074cea216cdb9c620066750187) Thanks [@OCzarnecki](https://github.com/OCzarnecki)! - Add `--latestForProject` to `meticulous agent js-coverage`. It resolves the project's preferred latest successful test run—the same run used by the webapp's project coverage view—and returns that run's whole-run coverage with the existing coverage columns and filters. `--project` optionally overrides an OAuth user's configured default project; project API tokens derive the project from the token. The client exposes the same operation as `getProjectJsCoverage`.

### Patch Changes

- [#11196](https://github.com/alwaysmeticulous/meticulous/pull/11196) [`d1ba630`](https://github.com/alwaysmeticulous/meticulous/commit/d1ba63009cdcb1227f9bdfe03af27a87ca7f819b) Thanks [@sesajad](https://github.com/sesajad)! - Add `getAgenticFileChanges` (posts to `agentic-session-generation/repo/file-changes`), returning a single changed file's unified diff (raw patch text) so the agent can see exactly what a file changed and the worker can compute edit-coverage from it. Also add an optional `coverage` field (edit-coverage: covered vs executable edited lines, per-file residual ranges) to `ReportAgenticRunResultParams` so an agentic run can report how much of the PR's changed code its generated sessions exercised.

- Updated dependencies [[`2b3c422`](https://github.com/alwaysmeticulous/meticulous/commit/2b3c422c47804ec7adfa79b4375c6bda7887c73c)]:
  - @alwaysmeticulous/api@2.312.0
  - @alwaysmeticulous/common@2.310.0

## 2.311.0

### Minor Changes

- [#11080](https://github.com/alwaysmeticulous/meticulous/pull/11080) [`7803a09`](https://github.com/alwaysmeticulous/meticulous/commit/7803a0993df1757f7cac69813630f16744fe9b91) Thanks [@sesajad](https://github.com/sesajad)! - Add client helpers for the agentic worker to prewarm and hold a durable repo-server lease for its whole run: `acquireAgenticRepoLease`, `getAgenticRepoLeaseStatus`, `heartbeatAgenticRepoLease`, and `releaseAgenticRepoLease`. The three source-read helpers (`getAgenticRepoFile`, `searchAgenticRepoCode`, `listAgenticRepoTree`) now accept an optional lease reference (`runId` / `leaseId` / `podInstanceId`, via the new `AgenticRepoLeaseRef`) so reads borrow the warm pod instead of acquiring a fresh short-lived lease each time; omitting it falls back to the previous per-read behaviour.

- [#11176](https://github.com/alwaysmeticulous/meticulous/pull/11176) [`eeb76d2`](https://github.com/alwaysmeticulous/meticulous/commit/eeb76d2d381179852f572e54f99a0d644dcd3770) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `meticulous auth login --device` (OAuth 2.0 Device Authorization Grant), so users can log in from remote or sandboxed machines — SSH sessions, containers, cloud coding agents — where a browser can't reach the CLI's localhost callback. `--non-interactive` is unchanged and still prints a loopback URL for same-machine completion; use `--device` instead when the browser is on a different machine.

### Patch Changes

- [#11080](https://github.com/alwaysmeticulous/meticulous/pull/11080) [`7803a09`](https://github.com/alwaysmeticulous/meticulous/commit/7803a0993df1757f7cac69813630f16744fe9b91) Thanks [@sesajad](https://github.com/sesajad)! - Add agentic source-read client methods so the agent can inspect the project's code, not just the PR diff: `getAgenticRepoFile` (read a file), `searchAgenticRepoCode` (ripgrep), `listAgenticRepoTree` (browse the tree), and `getAgenticChangedFiles` (list the PR's changed files). Each posts to the matching `agentic-session-generation/repo/*` (or `/changed-files`) endpoint and returns cap-free results served off the project's repo-server mirror.

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

- [#10444](https://github.com/alwaysmeticulous/meticulous/pull/10444) [`bc65ecf`](https://github.com/alwaysmeticulous/meticulous/commit/bc65ecf98fd34887ed2d76c8cc1f22d5bb7ec882) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Replace `reportAgenticProducedSessions` with `reportAgenticRunResult`, which reports the agent's whole run result — the cases it exercised (each with a title, steps, outcome, session ids, and optional notes) — rather than only the produced session ids. Adds the `AgenticRunResultCase` / `AgenticRunResultCaseOutcome` types and posts to `agentic-session-generation/result`.

- [#11063](https://github.com/alwaysmeticulous/meticulous/pull/11063) [`c500bb7`](https://github.com/alwaysmeticulous/meticulous/commit/c500bb70a38d0d019727e30f7613a6305a0c01ca) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Add `meticulous agent sessions` to list a project's most recently created sessions (newest first) — useful for finding the id of a session you just recorded. Default columns: `id`, `createdAt` (the stored row timestamp and the ordering basis), `recordedAt` (for a non-original session, the root session's recording time; otherwise the same as `createdAt`), `recordedBy`, `status` (`original`, `patched`, `sliced`, or `mutated`). Opt into `startUrl` with `--includeStartUrl` and `abandonedReason` with `--includeAbandonedReason`. Filter with `--createdSince`/`--createdUntil` (row timestamp), `--recordedSince`/`--recordedUntil` (root recording time), `--recordedBy` (recording identity), `--excludeSyntheticSessions` (also drops the `status` column), and `--visitedUrlFilter` (a glob where only `*` is a wildcard, matched against visited URLs and the startUrl). `--limit` defaults to 100 (max 1000) and always applies; `--offset` pages through further. `--json` outputs a bare array (matching the new hosted MCP tool, `get_sessions`).

- Updated dependencies [[`b22d975`](https://github.com/alwaysmeticulous/meticulous/commit/b22d9752538e6efdbfe74a14c002e61764c9fb0e), [`0d35d4d`](https://github.com/alwaysmeticulous/meticulous/commit/0d35d4d136ea4b0d5a7c0395189203e5831b6081)]:
  - @alwaysmeticulous/api@2.310.0
  - @alwaysmeticulous/common@2.310.0

## 2.308.0

### Minor Changes

- [#10900](https://github.com/alwaysmeticulous/meticulous/pull/10900) [`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs --counts` now reports aggregate totals from a dedicated, server-side counts endpoint (`getTestRunDiffsSummaryCounts`) instead of counting the fetched list client-side — so it returns just the numbers rather than transferring the full diffs list. The counts are: `numReplays` (executed replay comparisons), `numDiffs` (deduplicated user-visible differences), and the decision breakdown `numApproved` / `numIgnored` / `numRejected` / `numUnreviewed` (which sum to `numDiffs`). Computed live server-side (replay diffs + `diff_decisions`), so no diffs-summary computation/poll is needed.

- [#10900](https://github.com/alwaysmeticulous/meticulous/pull/10900) [`2df15a2`](https://github.com/alwaysmeticulous/meticulous/commit/2df15a295f6cce4e60754bba7ca4efc2c9dcaa37) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs` can now surface PR review decisions. `--includeReviewDecisions` adds a `decision` column/field per diff (`accepted` / `rejected` / `ignored` / `unreviewed`; `unreviewed` when undecided or the run has no PR), resolved against the test run's PR at request time. `--onlyUnreviewed` returns just the differences still awaiting review — across every difference, not only the selected representative subset (it implies `--includeAllDiffs`, so each row carries the `isSelected` column to tell selected from unselected differences). For a count of what's left to review without listing them, use `--counts`, whose `numUnreviewed` (part of the decision breakdown) gives that number. Both are opt-in query params, so no diffs-summary contract version bump.

## 2.307.0

### Minor Changes

- [#10679](https://github.com/alwaysmeticulous/meticulous/pull/10679) [`73b0b40`](https://github.com/alwaysmeticulous/meticulous/commit/73b0b401960bdd2e5f7b87aa3ac8d8f05f6f156e) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs` now reports differences only, aligned with the shared difference classifier. The `--includeMatches` flag is removed (matching screenshots, known flakes, and screenshots downstream of a divergence are no longer part of the summary), and the `total` column is dropped. The `index` column is now always emitted as a global rank: a flat priority rank by default, or a replayDiff-grouped rank under `--orderByReplayDiffs`. `agent image-urls`, `agent image-files`, and `agent dom-diff` continue to work for any replay diff + `screenshotName` (including screenshots with no diff) when you need to inspect a screenshot that isn't in the summary.

- [#10853](https://github.com/alwaysmeticulous/meticulous/pull/10853) [`09610cb`](https://github.com/alwaysmeticulous/meticulous/commit/09610cb51b85bc763123b537917a19e04d09aa10) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `meticulous auth set-project` now persists the selected project as a per-user setting on the backend, instead of in a local file — so it's consistent across machines and visible to the hosted MCP server, which has no access to local files. A new `meticulous auth get-project` prints the resolved project for scripting. `meticulous auth login` selects a project after logging in: an explicit `--project` (or, interactively, the picker) is persisted, a sole accessible project is auto-selected, and an existing default is respected as-is — so a returning `--non-interactive` login succeeds instead of failing for lack of a picker. `--project` on both `set-project` and `login` accepts a bare id, an `organization/name` slug, or a unique bare name (resolved server-side), not just the full slug. `meticulous auth logout` leaves the backend setting untouched (it's account state, not machine state). On the first OAuth-authenticated command after upgrading, any existing local `selected-project.json` is migrated to the backend setting once and then removed. The default can be changed but not cleared from the UI/CLI (the choice is always _which_ project, never none).

  `@alwaysmeticulous/client` gains `getOAuthDefaultProject`, `setOAuthDefaultProject`, and `resolveDefaultProjectId`; it no longer exports `getStoredProjectId`, `getStoredProject`, `setStoredProject`, or `clearStoredProject` (the removed local-file-backed project storage).

  `meticulous agent test-run-for-commit`, `test-run-diffs`, `js-coverage`, and `trigger-test-run` gain a `--project` flag: a one-off override for that call only (resolved flexibly — id, `organization/name` slug, or a unique bare name among your accessible projects), which never changes the stored default. When omitted, these commands now rely entirely on the backend's own project resolution (the token's project, or the stored default) rather than pre-resolving one locally.

### Patch Changes

- Updated dependencies [[`55d7f95`](https://github.com/alwaysmeticulous/meticulous/commit/55d7f95265d434d2d01eae40589e7307f9110492), [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b)]:
  - @alwaysmeticulous/api@2.307.0
  - @alwaysmeticulous/common@2.301.0

## 2.306.0

### Minor Changes

- [#10696](https://github.com/alwaysmeticulous/meticulous/pull/10696) [`c9dfd16`](https://github.com/alwaysmeticulous/meticulous/commit/c9dfd16bf6114470782e73362989fe9c97c2698f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent test-run-diffs` now surfaces failed diffs-summary computations instead of polling forever. The diffs-summary endpoint returns a new `failed` status (with a `reason`) when the previous computation ended in a terminal-failure state (rather than silently restarting and reporting `pending`), and accepts a `retrigger` flag to start a fresh run over a failed one. The CLI retriggers once, up front, if the computation is already `failed` when the command starts; once it's polling, a `failed` result is reported immediately and the command exits, rather than looping until the timeout.

- [#10727](https://github.com/alwaysmeticulous/meticulous/pull/10727) [`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd) Thanks [@phreppo](https://github.com/phreppo)! - Add a `--sessionFilter` option to `ci run-with-uploaded-asset-chunks` that restricts the triggered test run to sessions whose start URL matches at least one of the provided RE2 regexes.

- [#10702](https://github.com/alwaysmeticulous/meticulous/pull/10702) [`d493a2a`](https://github.com/alwaysmeticulous/meticulous/commit/d493a2a6fe7e931f09b32e8dbfe4b191aa103cab) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent js-coverage` now supports combining coverage from multiple test runs.
  - New `--headPlusTestRunIds` CLI flag: a comma-separated list of additional test run IDs to union with the run resolved by `--commitSha` (or the local git HEAD by default). Useful for seeing a project's normal coverage plus the coverage of a few extra runs, without running one combined test run. Cannot be combined with `--testRunId`.
  - New `--testRunIds` CLI flag: a comma-separated list of test run IDs where the first is the primary run and the rest are unioned in, for callers that already have an ordered list of run IDs on hand rather than a single run to resolve. Cannot be combined with `--testRunId`, `--commitSha`, or `--headPlusTestRunIds`.
  - The backend `GET agent/test-runs/:testRunId/js-coverage` endpoint gained a matching `unionTestRunIds` query param (comma-separated), and `@alwaysmeticulous/client`'s `getTestRunJsCoverage` gained a matching `unionTestRunIds` option. All listed test runs must belong to the same project and have executed the exact same commit as the primary.

### Patch Changes

- Updated dependencies [[`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd)]:
  - @alwaysmeticulous/api@2.306.0
  - @alwaysmeticulous/common@2.301.0

## 2.305.0

### Patch Changes

- [#10535](https://github.com/alwaysmeticulous/meticulous/pull/10535) [`ec6ab46`](https://github.com/alwaysmeticulous/meticulous/commit/ec6ab46b9685d8cb10dbb7bfac7442897a2caa57) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - Add `RequestedProjectAssetChunkReference` so chunked-asset-upload manifests may
  include `{ name, versionLookup: "latest-in-history" }` entries alongside
  concrete `{ name, versionId }` references. The server resolves lookups from
  ancestor test runs during deployment processing. Chunk path overlaps are
  computed once, over the fully-resolved manifest, and returned from the trigger
  response, so collisions involving resolved `versionLookup` entries are surfaced
  rather than silently dropped.
- Updated dependencies []:
  - @alwaysmeticulous/common@2.301.0

## 2.304.0

### Minor Changes

- [#10586](https://github.com/alwaysmeticulous/meticulous/pull/10586) [`879b04e`](https://github.com/alwaysmeticulous/meticulous/commit/879b04eac5966890f2b0d6f2aabf1ae139782f8d) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - `agent trigger-test-run` can now attach a git diff (`--gitDiffOutput`, or one inferred via `--repoDirectory`) when identifying the build by `--commitSha` instead of `--deploymentId`. The diff upload resolves the commit to a deployment server-side, and that resolved deployment is then reused for the trigger call, so both requests target the same deployment row.

### Patch Changes

- [#10618](https://github.com/alwaysmeticulous/meticulous/pull/10618) [`ae26bff`](https://github.com/alwaysmeticulous/meticulous/commit/ae26bff26f73209ff0ea4fca2b014d094be344d6) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Reordered the `agent js-coverage` / `agent js-coverage-diff` flags (and the corresponding `TestRunJsCoverageOptions` / `getReplayJsCoverage` / `getReplayDiffJsCoverage` option fields) so `--includeAllFiles` and `--globFilter` are grouped together ahead of the column-selection flags (`--includeExecutedRanges`, `--includeExecutableRanges`, `--includeUncoveredRanges`, `--includeCoveragePercentage`, `--prDiffOnly`), consistently across the CLI `--help` output and the client's TypeScript option types. No behavior change — request/response shapes and defaults are unchanged.

- [#10607](https://github.com/alwaysmeticulous/meticulous/pull/10607) [`950002e`](https://github.com/alwaysmeticulous/meticulous/commit/950002e88fa27063fb1cb3d631052cbfd6dbd8bb) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - Point non-interactive auth error messages at `meticulous auth login --non-interactive`. `meticulous replay` now resolves its token via the same shared, full auth-chain check as other commands (previously it only checked `--apiToken` in non-interactive mode, ignoring `METICULOUS_API_TOKEN`/stored OAuth/config-file tokens), and skips auth entirely for `--dryRun`.

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
