# @alwaysmeticulous/sdk-bundles-api

## 2.303.1

### Patch Changes

- [#10597](https://github.com/alwaysmeticulous/meticulous/pull/10597) [`849c5bc`](https://github.com/alwaysmeticulous/meticulous/commit/849c5bc94d20ee80bf96d4f411c670212ad58982) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Agent workspace setup now redacts more sensitive values

## 2.303.0

### Patch Changes

- [#10512](https://github.com/alwaysmeticulous/meticulous/pull/10512) [`76d9a10`](https://github.com/alwaysmeticulous/meticulous/commit/76d9a10b51cb553b3cb438893c2f5b2aaf7877bf) Thanks [@dennysem](https://github.com/dennysem)! - Surface the backend recorder's ioredis capture on `BackendRecorderHandle` as
  `withMeticulousIORedis`, so apps that load the recorder through the launcher
  bundle can record their Redis client. It is a wrapper applied where the client is
  constructed: `const redis = handle.withMeticulousIORedis(new Redis(url))`.

  This is required to capture ioredis in apps bundled by Next.js / Turbopack, where
  the recorder's require-hook instrumentation can never reach the bundled `ioredis`
  and patch `Redis.prototype.sendCommand` — the only seam is the app's own code
  wrapping the client. Unlike Prisma there is no native ioredis extension API, so
  the wrapper replaces `sendCommand` on the client instance (covering both `Redis`
  and `Cluster`); it dispatches at command time, so it is safe to apply at
  module-load time. The field is optional so older recorder bundles still satisfy
  the type.

## 2.302.0

### Patch Changes

- [#10482](https://github.com/alwaysmeticulous/meticulous/pull/10482) [`9a9c564`](https://github.com/alwaysmeticulous/meticulous/commit/9a9c564a7cf88da3872eb303981409eb178ef44b) Thanks [@dennysem](https://github.com/dennysem)! - Surface the backend recorder's Prisma capture on `BackendRecorderHandle` as
  `meticulousPrismaExtension`, so apps that load the recorder through the launcher
  bundle can record their Prisma client. It is the Prisma Client extension object,
  applied idiomatically with `client.$extends(handle.meticulousPrismaExtension)`.

  This is required to capture Prisma in apps bundled by Next.js / Turbopack, where
  the recorder's require-hook instrumentation can never reach the bundled Prisma
  client and `pg` driver — the only seam is the app's own code applying the
  extension. Apply it first/outermost (before read-replicas and field encryption);
  applied innermost, read-replicas routes reads to an unwrapped replica client and
  those reads are never captured. The field is optional so older recorder bundles
  still satisfy the type.

## 2.301.0

### Patch Changes

- [#10487](https://github.com/alwaysmeticulous/meticulous/pull/10487) [`e4715f7`](https://github.com/alwaysmeticulous/meticulous/commit/e4715f72807ffa9e7c6c6e55b922f7b0192bfac2) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Introduce replay killing errors option

- Updated dependencies [[`230db8c`](https://github.com/alwaysmeticulous/meticulous/commit/230db8ce6628ac7728497fe4f10d2e3d25387b5f)]:
  - @alwaysmeticulous/api@2.301.0

## 2.300.0

### Patch Changes

- Updated dependencies [[`df7aad6`](https://github.com/alwaysmeticulous/meticulous/commit/df7aad61870c8d6a1a64daa62f444256c78b7740), [`48a8d66`](https://github.com/alwaysmeticulous/meticulous/commit/48a8d66d22964c2d5ec40f1899a2587458399b5d)]:
  - @alwaysmeticulous/api@2.300.0

## 2.297.0

### Patch Changes

- Updated dependencies [[`9f22143`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9f2214326c94005c9be6a058eacf52226b81fb55)]:
  - @alwaysmeticulous/api@2.297.0

## 2.295.0

### Minor Changes

- [#1224](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1224) [`85cde31`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/85cde31621286698f37e29a94d089557daf3ce93) Thanks [@phreppo](https://github.com/phreppo)! - Expose native setTimeout, setInterval, clearTimeout, and clearInterval on replay.native API

### Patch Changes

- Updated dependencies [[`2a9e978`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/2a9e9785875d48311e0bcbb03167a1fddbe44be0)]:
  - @alwaysmeticulous/api@2.295.0

## 2.294.0

### Minor Changes

- [#1216](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1216) [`b0cc565`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b0cc56553437bfe3ae2ba52c1187af61906b2548) Thanks [@narobertson42](https://github.com/narobertson42)! - Add `maxPayloadSize` option to cap the size of individual session payload uploads

### Patch Changes

- Updated dependencies [[`b1e7f49`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/b1e7f498c93575b339e90c1d41e0f144f73daffb)]:
  - @alwaysmeticulous/api@2.294.0

## 2.293.0

### Minor Changes

- [#1219](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1219) [`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4) Thanks [@AlexKuhnle](https://github.com/AlexKuhnle)! - feat(cli): add agent JS coverage commands and resolve test runs by commit

### Patch Changes

- Updated dependencies [[`762b5c7`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/762b5c7aa30b9f031164b5fb1594d79d313a5ce4)]:
  - @alwaysmeticulous/api@2.293.0

## 2.292.1

### Patch Changes

- Updated dependencies [[`a5d44cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a5d44cc0339c1609ab9c3b529a57d1bddce3d74f)]:
  - @alwaysmeticulous/api@2.292.1

## 2.292.0

### Minor Changes

- [#1205](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1205) [`c99a4bb`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c99a4bb037128e0ed93622045438ebd7cd5fdfa5) Thanks [@narobertson42](https://github.com/narobertson42)! - Add `SessionStartUrlTransform` type and `sessionStartUrlTransform` field to `AppUrlConfig`

### Patch Changes

- Updated dependencies [[`654879d`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/654879d3b68ccd9a63d65ce5e16c100279dbd6ec)]:
  - @alwaysmeticulous/api@2.292.0

## 2.291.2

### Patch Changes

- [#1207](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1207) [`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b) Thanks [@phreppo](https://github.com/phreppo)! - Add the `window.Meticulous.replay.recordCustomSnapshot(...)` custom-snapshot API to the public replay window API, alongside `addOnBeforeScreenshotListener` and `addOnReplayCompletionListener`. This lets customers inject JavaScript into their application to instruct the Meticulous replay engine to snapshot arbitrary JSON-serializable data (e.g. an accessibility report or performance metrics) at replay time. Snapshots are auto-tagged with the stage during the session (the next screenshot taken) and persisted alongside the replay, so a custom check can later compare the base and head snapshots of a given type across a test run. Adds the optional `versionNumber` field to `Snapshot` so checks can detect when a snapshot's recorded format changed between base and head.

- Updated dependencies [[`5dcad4e`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/5dcad4ee98e0ba43943f709f8d9205fb934f8a5b)]:
  - @alwaysmeticulous/api@2.291.2

## 2.290.2

### Patch Changes

- Updated dependencies [[`d34feed`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/d34feed457cb7200f0deb98c64f239f144b9119f)]:
  - @alwaysmeticulous/api@2.290.2

## 2.290.0

### Patch Changes

- Updated dependencies [[`a1b7cbe`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/a1b7cbe49fae94621b9a2c9542c8d30cfbc06919)]:
  - @alwaysmeticulous/api@2.290.0

## 2.289.1

### Patch Changes

- Updated dependencies [[`c22df85`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/c22df8563fd645f56149c1fae68a3e53e17f7fef)]:
  - @alwaysmeticulous/api@2.289.1

## 2.288.2

### Patch Changes

- Updated dependencies [[`f4d81ea`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/f4d81eaca1ad45e0d9366d9021492cb1e5c2b323)]:
  - @alwaysmeticulous/api@2.288.2

## 2.288.0

### Patch Changes

- Updated dependencies [[`87dde72`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/87dde72040ec16638df12d3914c58a48f2d5a39b)]:
  - @alwaysmeticulous/api@2.288.0

## 2.287.0

### Minor Changes

- [#1172](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1172) [`64c6ddf`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/64c6ddf344dad3faff6841e1582f10f5f8a9fe50) Thanks [@phreppo](https://github.com/phreppo)! - Expose the Chrome/Chromium version on `window.Meticulous.replay.browser.version` so that performance metrics reported via the Performance API can be tagged with the browser build that produced them.

## 2.286.0

### Patch Changes

- Updated dependencies [[`66b4e0b`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/66b4e0b1699cc34b2387369e73939340599c5963)]:
  - @alwaysmeticulous/api@2.286.0

## 2.285.2

### Patch Changes

- Updated dependencies [[`7d62b67`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/7d62b6701defc5eefbd6cf82c55336a930047d71)]:
  - @alwaysmeticulous/api@2.285.2

## 2.285.1

### Patch Changes

- Updated dependencies [[`9b320d5`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9b320d5f8702ceb25fa1a4a2c4858b713d1e7efe)]:
  - @alwaysmeticulous/api@2.285.1

## 2.285.0

### Patch Changes

- Updated dependencies [[`9054b12`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/9054b12895986720514eb19db4445165ce627d03)]:
  - @alwaysmeticulous/api@2.285.0

## 2.283.1

### Patch Changes

- [#1149](https://github.com/alwaysmeticulous/meticulous-sdk/pull/1149) [`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Patched a potential security vulnerability

- Updated dependencies [[`15ec7cc`](https://github.com/alwaysmeticulous/meticulous-sdk/commit/15ec7cc7012bd641a80a140773c76f69c030daf0)]:
  - @alwaysmeticulous/api@2.283.1
