# @alwaysmeticulous/cli

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
