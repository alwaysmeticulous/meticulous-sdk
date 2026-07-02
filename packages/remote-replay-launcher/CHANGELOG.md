# @alwaysmeticulous/remote-replay-launcher

## 2.303.1

### Patch Changes

- Updated dependencies [[`5ae77f3`](https://github.com/alwaysmeticulous/meticulous/commit/5ae77f305b7cbd59174f7e5e73c454ece794099f)]:
  - @alwaysmeticulous/client@2.303.1
  - @alwaysmeticulous/common@2.301.0

## 2.302.0

### Minor Changes

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

- Updated dependencies [[`132ce89`](https://github.com/alwaysmeticulous/meticulous/commit/132ce893095bc0eb89abb000ae4982f3fed85355), [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659), [`d46e16b`](https://github.com/alwaysmeticulous/meticulous/commit/d46e16b439be7b82baa824ab78475c1bf7631659), [`41ae1dd`](https://github.com/alwaysmeticulous/meticulous/commit/41ae1dd2a01114677015abfbe905192b46aea471), [`d78f1a9`](https://github.com/alwaysmeticulous/meticulous/commit/d78f1a9f54461825700ffff970ddb0bf77c8da67)]:
  - @alwaysmeticulous/client@2.302.0
  - @alwaysmeticulous/common@2.301.0

## 2.301.0

### Minor Changes

- [#10213](https://github.com/alwaysmeticulous/meticulous/pull/10213) [`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(agent): split custom test-run triggering into `agent upload-build` and `agent trigger-test-run`

  A build can now be registered once (`meticulous agent upload-build`, returning a `deploymentId`) and re-triggered against any base (`meticulous agent trigger-test-run --deploymentId …`), instead of the fused `ci upload-*` custom-trigger flags (now deprecated). Both agent commands wait for the run by default and print only essential output unless `--verbose` is passed; opt out of waiting with `--dontWaitForTestRunToComplete`. Adds the `uploadBuild`/`triggerTestRun` launcher helpers, the `agent*` client methods, and the `getStashCreateSha`/`getUntrackedFiles` git helpers.

  Also removes the `withUncommittedChanges` field from the deployment/test-run API surface (`@alwaysmeticulous/client`, `@alwaysmeticulous/remote-replay-launcher`, `@alwaysmeticulous/api`). It carried no behaviour the diff's presence didn't already convey — whether a run includes uncommitted changes is inferred from the uploaded git diff — so the redundant, foot-gun-prone flag is gone.

### Patch Changes

- Updated dependencies [[`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f)]:
  - @alwaysmeticulous/client@2.301.0
  - @alwaysmeticulous/common@2.301.0
  - @alwaysmeticulous/api@2.301.0
  - @alwaysmeticulous/tunnels-client@2.301.0

## 2.300.0

### Patch Changes

- Updated dependencies [[`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740), [`48a8d66`](https://github.com/alwaysmeticulous/meticulous/commit/48a8d66d22964c2d5ec40f1899a2587458399b5d)]:
  - @alwaysmeticulous/api@2.300.0
  - @alwaysmeticulous/common@2.300.0
  - @alwaysmeticulous/client@2.300.0
  - @alwaysmeticulous/tunnels-client@2.300.0

## 2.299.0

### Patch Changes

- Updated dependencies [[`4406b07`](https://github.com/alwaysmeticulous/meticulous/commit/4406b07d938d31583e87e80c3a7d3da658e695ce), [`ae52f77`](https://github.com/alwaysmeticulous/meticulous/commit/ae52f77bf4b3541da7c2eeb6fa10345c660d0c2c)]:
  - @alwaysmeticulous/client@2.299.0
  - @alwaysmeticulous/common@2.299.0
  - @alwaysmeticulous/tunnels-client@2.299.0

## 2.298.1

### Patch Changes

- [#10259](https://github.com/alwaysmeticulous/meticulous/pull/10259) [`43dc613`](https://github.com/alwaysmeticulous/meticulous/commit/43dc613a33a90a6334b759336303fb3a015dee88) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op test change

## 2.298.0

### Patch Changes

- Updated dependencies [[`5f5122a`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5f5122a7e69d2f0b80dfb26bf883acc9e5e3743d), [`27df430`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/27df430046651864302df98d548a8a91df069521)]:
  - @alwaysmeticulous/client@2.298.0
  - @alwaysmeticulous/common@2.298.0
  - @alwaysmeticulous/tunnels-client@2.298.0

## 2.297.1

### Patch Changes

- Updated dependencies [[`142a03f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/142a03f40c4c535014b01c65cbf0a2ab4f4f0240)]:
  - @alwaysmeticulous/client@2.297.1

## 2.297.0

### Minor Changes

- [#1171](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1171) [`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55) Thanks [@sesajad](https://github.com/sesajad)! - Add support for uploading assets as incremental chunks. New `ci upload-asset-chunk` and `ci run-with-uploaded-asset-chunks` CLI commands upload each asset chunk as a compressed `tar` archive to a signed URL, skipping chunks the server already has and warning on overlapping files.

### Patch Changes

- Updated dependencies [[`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55)]:
  - @alwaysmeticulous/client@2.297.0
  - @alwaysmeticulous/api@2.297.0
  - @alwaysmeticulous/common@2.293.0

## 2.296.0

### Patch Changes

- Updated dependencies [[`bfee3f0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/bfee3f0e146549ecfd652e58e628a5a45fa4c0f4)]:
  - @alwaysmeticulous/client@2.296.0

## 2.295.0

### Patch Changes

- Updated dependencies [[`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0)]:
  - @alwaysmeticulous/api@2.295.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/client@2.295.0

## 2.294.0

### Patch Changes

- Updated dependencies [[`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb)]:
  - @alwaysmeticulous/api@2.294.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/client@2.294.0

## 2.293.1

### Patch Changes

- Updated dependencies [[`fd3f997`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/fd3f997d816df92aba010834e1da79383dbb62a9)]:
  - @alwaysmeticulous/client@2.293.1

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

### Patch Changes

- Updated dependencies [[`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4), [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4)]:
  - @alwaysmeticulous/client@2.293.0
  - @alwaysmeticulous/tunnels-client@2.293.0
  - @alwaysmeticulous/common@2.293.0
  - @alwaysmeticulous/api@2.293.0

## 2.292.1

### Patch Changes

- Updated dependencies [[`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f)]:
  - @alwaysmeticulous/api@2.292.1
  - @alwaysmeticulous/client@2.292.1
  - @alwaysmeticulous/common@2.290.3

## 2.292.0

### Patch Changes

- Updated dependencies [[`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec)]:
  - @alwaysmeticulous/api@2.292.0
  - @alwaysmeticulous/client@2.292.0
  - @alwaysmeticulous/common@2.290.3

## 2.291.2

### Patch Changes

- Updated dependencies [[`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b)]:
  - @alwaysmeticulous/api@2.291.2
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.291.2

## 2.291.0

### Patch Changes

- Updated dependencies [[`a3fc01f`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a3fc01fdb82cbe659c1e0969b4ab7a4d237fa04b)]:
  - @alwaysmeticulous/client@2.291.0

## 2.290.3

### Patch Changes

- Updated dependencies [[`09b9e8b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/09b9e8bcd3b613fac3afcf778365d63051d8e557)]:
  - @alwaysmeticulous/common@2.290.3
  - @alwaysmeticulous/client@2.290.3
  - @alwaysmeticulous/tunnels-client@2.290.3

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2
  - @alwaysmeticulous/client@2.290.2
  - @alwaysmeticulous/common@2.287.1

## 2.290.0

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0
  - @alwaysmeticulous/client@2.290.0
  - @alwaysmeticulous/common@2.287.1

## 2.289.2

### Patch Changes

- Updated dependencies [[`8731225`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/8731225adb4cf22c9d1341972583931369c17882)]:
  - @alwaysmeticulous/client@2.289.2

## 2.289.1

### Patch Changes

- Updated dependencies [[`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef)]:
  - @alwaysmeticulous/api@2.289.1
  - @alwaysmeticulous/client@2.289.1
  - @alwaysmeticulous/common@2.287.1

## 2.289.0

### Patch Changes

- Updated dependencies [[`966e0b0`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/966e0b0e110442a552aa0937c0570db7defd38a8)]:
  - @alwaysmeticulous/client@2.289.0

## 2.288.2

### Patch Changes

- Updated dependencies [[`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323)]:
  - @alwaysmeticulous/api@2.288.2
  - @alwaysmeticulous/client@2.288.2
  - @alwaysmeticulous/common@2.287.1

## 2.288.1

### Patch Changes

- Updated dependencies [[`4e97f21`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/4e97f216670021a925f8beac64657985180a6edc)]:
  - @alwaysmeticulous/client@2.288.1

## 2.288.0

### Patch Changes

- Updated dependencies [[`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b)]:
  - @alwaysmeticulous/api@2.288.0
  - @alwaysmeticulous/client@2.288.0
  - @alwaysmeticulous/common@2.287.1

## 2.287.1

### Patch Changes

- Updated dependencies [[`57dddad`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/57dddad0861feb9f0bfc8947621106298cfe36b7)]:
  - @alwaysmeticulous/common@2.287.1
  - @alwaysmeticulous/client@2.287.1
  - @alwaysmeticulous/tunnels-client@2.287.1

## 2.286.0

### Patch Changes

- Updated dependencies [[`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963)]:
  - @alwaysmeticulous/api@2.286.0
  - @alwaysmeticulous/client@2.286.0
  - @alwaysmeticulous/common@2.283.1

## 2.285.2

### Patch Changes

- Updated dependencies [[`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71)]:
  - @alwaysmeticulous/api@2.285.2
  - @alwaysmeticulous/client@2.285.2
  - @alwaysmeticulous/common@2.283.1

## 2.285.1

### Patch Changes

- Updated dependencies [[`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe)]:
  - @alwaysmeticulous/api@2.285.1
  - @alwaysmeticulous/client@2.285.1
  - @alwaysmeticulous/common@2.283.1

## 2.285.0

### Patch Changes

- Updated dependencies [[`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03)]:
  - @alwaysmeticulous/api@2.285.0
  - @alwaysmeticulous/client@2.285.0
  - @alwaysmeticulous/common@2.283.1

## 2.284.0

### Patch Changes

- Updated dependencies [[`60154f4`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/60154f4e5a901423bf28e3deb37f5a6164d83ad3)]:
  - @alwaysmeticulous/client@2.284.0

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability

- Updated dependencies [[`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0)]:
  - @alwaysmeticulous/tunnels-client@2.283.1
  - @alwaysmeticulous/client@2.283.1
  - @alwaysmeticulous/common@2.283.1
  - @alwaysmeticulous/api@2.283.1

## 2.283.0

### Patch Changes

- Updated dependencies [[`0806546`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/0806546254d3e63167b7406dc1cf8483a06c4003)]:
  - @alwaysmeticulous/client@2.283.0

## 2.281.0

### Patch Changes

- Updated dependencies [[`f6f780e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f6f780ebd294643d3d0f659187af4b4e624477aa)]:
  - @alwaysmeticulous/client@2.281.0
