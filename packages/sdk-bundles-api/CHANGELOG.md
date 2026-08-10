# @alwaysmeticulous/sdk-bundles-api

## 2.324.0

### Patch Changes

- [#11888](https://github.com/alwaysmeticulous/meticulous/pull/11888) [`e9d9a7a`](https://github.com/alwaysmeticulous/meticulous/commit/e9d9a7a74abac6468e18ec347684f421ddfcab12) Thanks [@claude](https://github.com/apps/claude)! - Add an optional `backendTestingLogicVersion` field to `ReplayExecutionOptions`, threaded through from a project's `BACKEND_TESTING_LOGIC_NUMBER` when backend testing is enabled. This lets bumping that number invalidate cached screenshots only for backend-testing-enabled projects, leaving every other project's cache untouched. Purely additive — existing callers are unaffected.

- [#11940](https://github.com/alwaysmeticulous/meticulous/pull/11940) [`38e5c1a`](https://github.com/alwaysmeticulous/meticulous/commit/38e5c1a36ee1c47d0adad1c92a5f7c2dd08a26d6) Thanks [@dennysem](https://github.com/dennysem)! - Add `withMeticulousOperation` and `recordMeticulousObservation` to `BackendRecorderHandle` — a
  generic, self-serve seam for backend recording.

  `withMeticulousOperation({ name, key }, fn)` wraps one call so it is recorded in record mode
  and served from the recording in replay mode, where `fn` is never invoked. It covers two cases
  the per-technology instrumentations cannot: a client library Meticulous has no instrumentation
  for, and — often the better seam even for a supported transport — an operation sitting _above_
  one, such as a function that reads a cache and falls back to an API. Instrumenting only the
  transport there records nothing when the recorded run hit the cache.

  `recordMeticulousObservation(name, value)` records app state that no call produces (resolved
  feature flags, a chosen experiment arm) into the session. It never throws, never changes
  control flow, and is ignored during replay.

  Both fields are optional, so a handle from an older recorder bundle still satisfies the type.

- [#11973](https://github.com/alwaysmeticulous/meticulous/pull/11973) [`3d94e23`](https://github.com/alwaysmeticulous/meticulous/commit/3d94e23e750a448db9e3270db62737e8f4af9a3e) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add `cookieNamesToInferFromBearerToken` to `ReplayExecutionOptions`. When set, the named cookies have their value inferred at replay time from the bearer token in the Authorization header of the first recorded request that carries one, rather than from a fixed value.

- [#11940](https://github.com/alwaysmeticulous/meticulous/pull/11940) [`38e5c1a`](https://github.com/alwaysmeticulous/meticulous/commit/38e5c1a36ee1c47d0adad1c92a5f7c2dd08a26d6) Thanks [@dennysem](https://github.com/dennysem)! - Add `isMeticulousReplaying`, `stubWithMeticulous` and `recordWithMeticulous` to
  `BackendRecorderHandle` — the same capture as `withMeticulousOperation`, split into the two
  halves the app calls itself.

  Some teams will not put their own code inside our callback. These move the branch into the app
  instead:

  ```ts
  function getUser(id: string) {
    if (handle.isMeticulousReplaying()) {
      return handle.stubWithMeticulous<User>(`user_${id}`);
    }
    const user = crm.getUser(id);
    handle.recordWithMeticulous(`user_${id}`, user);
    return user;
  }
  ```

  Recordings interoperate with `withMeticulousOperation`'s in both directions: the name is the
  whole identity and keys the same way the wrapper's no-key form does. `recordWithMeticulous`
  accepts a promise (its resolved value is recorded, or its rejection as the error) and leaves the
  promise the caller holds untouched, so `stubWithMeticulous` returns a promise to match.

  The branch is unavoidable in this form — the app keeps the invocation, so only the app can stop
  the real call happening — and `isMeticulousReplaying()` is what it should branch on.
  `METICULOUS_BUILD` marks the image, which is the same one in both modes, so branching on it would
  take the stub path while recording and never record anything; `METICULOUS_BACKEND_RECORDER_MODE`
  is the mode the process was asked for, whereas this is true only when the recorder actually
  initialised into replay.

  The wrapper remains the recommendation where handing over the call is acceptable: it has one
  path so it cannot be branched wrongly, and it captures a thrown error, which the split form
  cannot see (a rejected promise it does capture).

  All three fields are optional, so a handle from an older recorder bundle still satisfies the
  type.

- Updated dependencies [[`297a0f5`](https://github.com/alwaysmeticulous/meticulous/commit/297a0f57c2acbb26e48c8f346b463f240212941f), [`b1f6156`](https://github.com/alwaysmeticulous/meticulous/commit/b1f61565c15626c704e6892cab658c4059785297)]:
  - @alwaysmeticulous/api@2.324.0

## 2.323.0

### Patch Changes

- Updated dependencies [[`3abdf06`](https://github.com/alwaysmeticulous/meticulous/commit/3abdf06b85ef1b9d054b54ab500c6462a4556c3c)]:
  - @alwaysmeticulous/api@2.323.0

## 2.321.0

### Patch Changes

- [#11616](https://github.com/alwaysmeticulous/meticulous/pull/11616) [`5bfa22f`](https://github.com/alwaysmeticulous/meticulous/commit/5bfa22f2ffb76e357ef9bed77f30ef29538a3b58) Thanks [@dennysem](https://github.com/dennysem)! - Add `BackendRecorderHandle.withMeticulousPostgres`, the wrapper that records and replays
  postgres.js (the `postgres` npm package) queries.

  Apply it to your `sql` instance where you construct it:

  ```ts
  const handle = await initBackendRecorder(config);
  const sql =
    handle?.withMeticulousPostgres?.(postgres(connectionString)) ??
    postgres(connectionString);
  ```

  This is required for apps whose bundler inlines `postgres` — a Vite SSR graph (React Router,
  TanStack Start), Next.js / Turbopack and similar — because `postgres` then never passes through
  Node's module loader, so the recorder's require-hook instrumentation can never fire. Apps that
  `require`/`import` it normally are instrumented automatically and need no wrapper.

  Every postgres.js query funnels through one internal method, so the wrapper instruments that
  rather than the client instance: one call also covers read-replica clients and any other client
  in the process. It dispatches at query time, so it is safe to apply at module-load time even
  though replay-mode init is asynchronous, and it is a no-op when the recorder is disabled.

- Updated dependencies [[`3529e08`](https://github.com/alwaysmeticulous/meticulous/commit/3529e081dc13602a463e3d47c64b674316777722)]:
  - @alwaysmeticulous/api@2.321.0

## 2.319.0

### Patch Changes

- [#11519](https://github.com/alwaysmeticulous/meticulous/pull/11519) [`ffd6711`](https://github.com/alwaysmeticulous/meticulous/commit/ffd6711945c015a2e357483cfe19f5cd1ff6af9b) Thanks [@linpengzhang](https://github.com/linpengzhang)! - Add the optional `baseSessionWaitMs` to `ReplayAndStoreResultsResult`, reporting how long a replay was blocked waiting for its base session to finish after its own work was done. The orchestrator sums it across a test case's attempts to work out whether base waits pushed out a chunk's wall clock, which is what makes them cost compute. Older bundles simply omit it.

- Updated dependencies [[`46fce61`](https://github.com/alwaysmeticulous/meticulous/commit/46fce6165d356e006bd432c16c194034cce4b7c9), [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b)]:
  - @alwaysmeticulous/api@2.319.0

## 2.316.0

### Patch Changes

- [#11449](https://github.com/alwaysmeticulous/meticulous/pull/11449) [`777bfaf`](https://github.com/alwaysmeticulous/meticulous/commit/777bfaf0c3c169a367b3bba7244973023a2908f3) Thanks [@joshivanhoe](https://github.com/joshivanhoe)! - `meticulous crawl` now resolves auth the same way as other commands (explicit `--apiToken` → OAuth login → `METICULOUS_API_TOKEN` → legacy config file), so it honors `meticulous auth set-project` and prompts for a browser login when no credentials are stored, instead of silently recording into whatever project a legacy config-file token points at. Also fixes `--maxNumSessions` closing the browser before the manual-login prompt: the cap is now only enforced once crawling actually starts, and sessions recorded while logging in no longer count towards it.

## 2.315.0

### Minor Changes

- [#11388](https://github.com/alwaysmeticulous/meticulous/pull/11388) [`5931dfd`](https://github.com/alwaysmeticulous/meticulous/commit/5931dfd6fd798e1a45cf5f507005e71e9018396f) Thanks [@claude](https://github.com/apps/claude)! - Add a customer-facing `meticulous crawl` command. It crawls your app from a given start URL in a local headed browser — pausing first so you can manually log in — records the visited pages as sessions, and then creates a test run from them. Auth uses your project API token; the sessions and test run are always scoped to that project.

## 2.312.0

### Patch Changes

- Updated dependencies [[`2b3c422`](https://github.com/alwaysmeticulous/meticulous/commit/2b3c422c47804ec7adfa79b4375c6bda7887c73c)]:
  - @alwaysmeticulous/api@2.312.0

## 2.310.0

### Patch Changes

- Updated dependencies [[`b22d975`](https://github.com/alwaysmeticulous/meticulous/commit/b22d9752538e6efdbfe74a14c002e61764c9fb0e)]:
  - @alwaysmeticulous/api@2.310.0

## 2.307.0

### Minor Changes

- [#10897](https://github.com/alwaysmeticulous/meticulous/pull/10897) [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Add `transformStreamingFetchResponseData` and `transformStreamingXhrResponseData` to `RecorderMiddleware`, allowing recorder middleware to redact or drop streaming fetch and streaming XHR response data before it is uploaded.

  If a middleware defines `transformNetworkRequest` or `transformNetworkResponse` but not the corresponding streaming transform, streaming response data is dropped entirely rather than recorded unredacted.

### Patch Changes

- Updated dependencies [[`55d7f95`](https://github.com/alwaysmeticulous/meticulous/commit/55d7f95265d434d2d01eae40589e7307f9110492), [`6944922`](https://github.com/alwaysmeticulous/meticulous/commit/6944922494b099622db8dfbe12f93ce8cf755a9b)]:
  - @alwaysmeticulous/api@2.307.0

## 2.306.0

### Patch Changes

- Updated dependencies [[`7c90bbd`](https://github.com/alwaysmeticulous/meticulous/commit/7c90bbddf757fae6a4d3d0c514b4ef79214cb4dd)]:
  - @alwaysmeticulous/api@2.306.0

## 2.305.0

### Patch Changes

- [#10707](https://github.com/alwaysmeticulous/meticulous/pull/10707) [`f52aa9e`](https://github.com/alwaysmeticulous/meticulous/commit/f52aa9e6ff8d3f523a177f47f69e2039b268190b) Thanks [@dennysem](https://github.com/dennysem)! - Re-export the `MeticulousPrismaExtension` and `MeticulousIORedisWrapper` types
  from the package root. They were declared in the backend-recorder module but not
  surfaced by the barrel, so consumers could not import them from
  `@alwaysmeticulous/sdk-bundles-api`.

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
