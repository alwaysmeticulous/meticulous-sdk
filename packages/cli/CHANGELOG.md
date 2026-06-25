# @alwaysmeticulous/cli

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
