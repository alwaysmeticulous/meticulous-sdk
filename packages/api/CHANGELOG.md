# @alwaysmeticulous/api

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
