# @alwaysmeticulous/cli

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
