# @alwaysmeticulous/custom-checks

## 2.297.0

### Patch Changes

- Updated dependencies [[`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55)]:
  - @alwaysmeticulous/client@2.297.0
  - @alwaysmeticulous/api@2.297.0
  - @alwaysmeticulous/downloading-helpers@2.297.0
  - @alwaysmeticulous/common@2.293.0

## 2.296.0

### Patch Changes

- [#1230](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1230) [`85f0d62`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/85f0d62f111dd5052ed716313a535996aa66497b) Thanks [@phreppo](https://github.com/phreppo)! - Rename `findTestRunByCommitAndWaitForCompletion` to `findTestRunByCommitForCustomChecks` (and `FindTestRunByCommitAndWaitForCompletionOptions` to `FindTestRunByCommitForCustomChecksOptions`) so both test-run lookup helpers clearly target custom checks.

- Updated dependencies [[`bfee3f0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/bfee3f0e146549ecfd652e58e628a5a45fa4c0f4)]:
  - @alwaysmeticulous/client@2.296.0
  - @alwaysmeticulous/downloading-helpers@2.296.0

## 2.295.0

### Patch Changes

- Updated dependencies [[`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0)]:
  - @alwaysmeticulous/api@2.295.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/client@2.295.0
  - @alwaysmeticulous/downloading-helpers@2.295.0

## 2.294.0

### Minor Changes

- [#1211](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1211) [`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb) Thanks [@phreppo](https://github.com/phreppo)! - Rename the `CustomCheckVerdict` values reported by custom checks: `warn` → `warn-without-requiring-user-ack` and `fail` → `warn-and-require-user-ack` (`pass` is unchanged). The two warning verdicts now make the distinction explicit: `warn-and-require-user-ack` surfaces a report the user is asked to acknowledge (review), while `warn-without-requiring-user-ack` is informational only.

### Patch Changes

- Updated dependencies [[`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb)]:
  - @alwaysmeticulous/api@2.294.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/client@2.294.0
  - @alwaysmeticulous/downloading-helpers@2.294.0

## 2.293.1

### Patch Changes

- [#1221](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1221) [`fd3f997`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/fd3f997d816df92aba010834e1da79383dbb62a9) Thanks [@phreppo](https://github.com/phreppo)! - Register a test run as expecting custom check results so the Meticulous UI's "Checks" tab is only shown for runs that will actually report results. `findTestRunForCustomChecks` (and `findTestRunByCommitAndWaitForCompletion`) now fire a best-effort `POST test-runs/:id/expect-custom-checks` against the effective (merged-after-network-patching) run once it is resolved — i.e. the run the user actually sees — before the caller downloads snapshots and computes the checks. Adds the `markTestRunExpectsCustomChecks` client API. The call never fails the wait: older backends without the endpoint, transient errors, or a 404 are tolerated, and reporting results marks the run as a backstop.

  Adds a `skipRegisteringExpectedCustomChecks` option to the wait helpers to suppress that signal — useful when iterating on a custom check locally against a real test run (e.g. a dry run that won't report results: you can wait for it and pull its snapshots without making the run show a "waiting for checks" tab).

  **Breaking:** renames `findTestRunByIdAndWaitForCompletion` to `findTestRunForCustomChecks` (and its options type `FindTestRunByIdAndWaitForCompletionOptions` to `FindTestRunForCustomChecksOptions`) to make its custom-checks purpose explicit. Call it at the start of a custom check script, before computing/reporting results.

- Updated dependencies [[`fd3f997`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/fd3f997d816df92aba010834e1da79383dbb62a9)]:
  - @alwaysmeticulous/client@2.293.1
  - @alwaysmeticulous/downloading-helpers@2.293.1

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

### Patch Changes

- Updated dependencies [[`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4), [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4)]:
  - @alwaysmeticulous/client@2.293.0
  - @alwaysmeticulous/downloading-helpers@2.293.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/api@2.293.0

## 2.292.1

### Patch Changes

- [#1217](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1217) [`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f) Thanks [@phreppo](https://github.com/phreppo)! - Report custom check results against the effective (merged) test run after network patching (session repair). When network patching is enabled, completing the original test run triggers a hidden patching run that is merged into a separate run, and that merged run is the one surfaced in the Meticulous UI. `findTestRunByIdAndWaitForCompletion` now resolves and returns this effective merged run once patching settles, falling back to the original run on older backends (404), transient errors, or timeout. Adds the `TestRunNetworkPatchingResult` type to `@alwaysmeticulous/api` and the `getTestRunNetworkPatchingResult` client API.

- Updated dependencies [[`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f)]:
  - @alwaysmeticulous/api@2.292.1
  - @alwaysmeticulous/client@2.292.1
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/downloading-helpers@2.292.1

## 2.292.0

### Patch Changes

- Updated dependencies [[`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec)]:
  - @alwaysmeticulous/api@2.292.0
  - @alwaysmeticulous/client@2.292.0
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/downloading-helpers@2.292.0

## 2.291.2

### Patch Changes

- [#1207](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1207) [`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b) Thanks [@phreppo](https://github.com/phreppo)! - Add the `window.Meticulous.replay.recordCustomSnapshot(...)` custom-snapshot API to the public replay window API, alongside `addOnBeforeScreenshotListener` and `addOnReplayCompletionListener`. This lets customers inject JavaScript into their application to instruct the Meticulous replay engine to snapshot arbitrary JSON-serializable data (e.g. an accessibility report or performance metrics) at replay time. Snapshots are auto-tagged with the stage during the session (the next screenshot taken) and persisted alongside the replay, so a custom check can later compare the base and head snapshots of a given type across a test run. Adds the optional `versionNumber` field to `Snapshot` so checks can detect when a snapshot's recorded format changed between base and head.

- Updated dependencies [[`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b)]:
  - @alwaysmeticulous/api@2.291.2
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.291.2
  - @alwaysmeticulous/downloading-helpers@2.291.2

## 2.291.0

### Patch Changes

- Updated dependencies [[`a3fc01f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a3fc01fdb82cbe659c1e0969b4ab7a4d237fa04b)]:
  - @alwaysmeticulous/client@2.291.0
  - @alwaysmeticulous/downloading-helpers@2.291.0

## 2.290.3

### Patch Changes

- Updated dependencies [[`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557)]:
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.290.3
  - @alwaysmeticulous/downloading-helpers@2.290.3

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2
  - @alwaysmeticulous/client@2.290.2
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/downloading-helpers@2.290.2

## 2.290.1

### Patch Changes

- [#1197](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1197) [`998373e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/998373e9ad240bb5ae2c1f700d25b96f8e616b61) Thanks [@phreppo](https://github.com/phreppo)! - Rework `getSnapshotsFromTestRun` to download custom check snapshots on the client. It now asks the backend for a single (once-)signed base URL plus the list of snapshot files for the test run and its base, then downloads and assembles them in parallel — instead of the backend reading, unzipping and returning every snapshot inline, which was slow (>3m) for large runs.

## 2.290.0

### Minor Changes

- [#1195](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1195) [`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919) Thanks [@phreppo](https://github.com/phreppo)! - Add the `@alwaysmeticulous/custom-checks` package for writing custom check scripts: `findTestRunByCommitAndWaitForCompletion` / `findTestRunByIdAndWaitForCompletion`, `getSnapshotsFromTestRun`, and `reportCustomCheckResults`. The custom-check helpers (and `getSnapshotsFromTestRun`) move out of `@alwaysmeticulous/client` into this package, and the deprecated `plugins` CLI command is removed.

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0
  - @alwaysmeticulous/client@2.290.0
  - @alwaysmeticulous/common@2.287.1
