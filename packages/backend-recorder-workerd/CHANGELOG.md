# @alwaysmeticulous/backend-recorder-workerd

## 2.334.0

### Patch Changes

- [#12864](https://github.com/alwaysmeticulous/meticulous/pull/12864) [`eb44010`](https://github.com/alwaysmeticulous/meticulous/commit/eb4401080587c0bd6cbb87e10d72f3ec67e7f75e) Thanks [@dennysem](https://github.com/dennysem)! - Stop recording container health probes. A GET or HEAD to a conventional probe path (`/health`, `/healthz`, `/healthcheck`, `/health-check`, `/_health`, `/api/health`, `/api/healthz`, `/readyz`, `/livez`, `/ping`) that carries no `x-meticulous-session-id` never enters the capture context, so neither the inbound request nor the outgoing `fetch`, binding and KV calls it fans out to are reported. A Kubernetes probe or load balancer polls these for the lifetime of the pod with no session identity, so the spans could never be replayed and served only to add noise to ingestion's time-window attachment fallback.

  A request that names its session is real app traffic whatever its path, so an app that serves `/api/health` as a page's data source keeps recording it — which also means this can only drop spans that ingestion's session-id match would have discarded anyway. Record mode only: a replay is unaffected.

  The sidecar repeats the same verdict on the events it receives, dropping the inbound event and everything sharing its `requestId`. That is what lets the exclusion reach an app whose bundled shim predates this release: redeploying the sidecar Worker needs no change to the app, whereas the shim-side check only takes effect once the shim is bumped in the app's own bundle and the app is redeployed. Against an up-to-date shim it is a no-op, since no probe is ever reported.

## 2.333.1

### Patch Changes

- [#12849](https://github.com/alwaysmeticulous/meticulous/pull/12849) [`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op patch release of every public package.

## 2.333.0

### Patch Changes

- [#12828](https://github.com/alwaysmeticulous/meticulous/pull/12828) [`d177020`](https://github.com/alwaysmeticulous/meticulous/commit/d177020f79a3a74e4476eefa10be2fcc03c97428) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Fix a crash the coverage instrumentation could introduce into a customer's SSR app when a function's own source is extracted and re-executed outside its module — e.g. `fn.toString()` serialized into a standalone inline `<script>`, a common no-FOUC theme-init pattern. The instrumented function still called the imported `__mcEnter`/`__mcHit` bindings by bare reference, which threw `ReferenceError` once those functions ran in a scope where the enclosing module's `import` was never in scope. Every call site now goes through a `typeof` check first, which — unlike a bare reference — never throws on an identifier that isn't bound in the current scope, so an extracted fragment silently loses coverage attribution instead of crashing the app.

## 2.331.3

### Patch Changes

- [#12687](https://github.com/alwaysmeticulous/meticulous/pull/12687) [`4a74a3d`](https://github.com/alwaysmeticulous/meticulous/commit/4a74a3dc934f44e38ff2c4ea7bacfd4162f24950) Thanks [@dennysem](https://github.com/dennysem)! - Report line coverage for source files outside the Vite root, which in a monorepo is every workspace package the app imports. The coverage plugin emitted the build machine's absolute path for those files, and an absolute path carries the build's own checkout prefix, so it resolves against no file in the repository and its coverage is discarded as unmapped. They are now emitted relative to the root, `../`-prefixed: the number of `../` segments is the root's own depth, so stripping them recovers the path relative to the repository. That is also the shape the frontend's coverage uses, so a file that ships to both the client and the server bundle now reports one merged set of covered lines rather than only whichever half was resolved first.

  Coverage is instrumented at build time, so this takes effect for builds made with this version onwards; earlier builds keep reporting the absolute paths.

## 2.331.0

### Patch Changes

- [#12529](https://github.com/alwaysmeticulous/meticulous/pull/12529) [`8bee1d0`](https://github.com/alwaysmeticulous/meticulous/commit/8bee1d0cc1a2b33d7ce9b3c6aa403ace0427bb91) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Forwards the inbound `x-meticulous-virtual-time` header on outbound replay lookups so the sidecar can pick among collapsed match-key candidates by closest recorded timestamp instead of HTTP arrival order.

## 2.330.0

### Patch Changes

- [#12503](https://github.com/alwaysmeticulous/meticulous/pull/12503) [`35bd171`](https://github.com/alwaysmeticulous/meticulous/commit/35bd1712f0d55018bcf69587e910f1e9aa2a4b2e) Thanks [@dennysem](https://github.com/dennysem)! - Draw from the seeded generator from the first draw during replay, instead of returning one repeated constant for a call site's first draws, so ids an app mints from consecutive random draws stay distinct.

## 2.329.0

### Minor Changes

- [#12437](https://github.com/alwaysmeticulous/meticulous/pull/12437) [`facc68c`](https://github.com/alwaysmeticulous/meticulous/commit/facc68cc4fb26d8d8a9861ffb2cf8ee7f13043ea) Thanks [@calebgcc](https://github.com/calebgcc)! - Prefix Workerd console output with the active replay ID during backend replay, allowing app-container logs from concurrent replay requests to be attributed to the correct replay.

- [#12252](https://github.com/alwaysmeticulous/meticulous/pull/12252) [`eeba9b5`](https://github.com/alwaysmeticulous/meticulous/commit/eeba9b506e0592545b15b3daa22dbee9b6373044) Thanks [@dennysem](https://github.com/dennysem)! - Adds build-time line coverage for Cloudflare Workers replays. A new
  `@alwaysmeticulous/backend-recorder-workerd/vite` entry point exports
  `meticulousCoverage()`, a Vite plugin that marks each line of the server bundle,
  and `withMeticulous` now reports the lines a replayed request executed to the
  Meticulous replay sidecar.

  This exists because workerd exposes no usable V8 coverage: its inspector never
  dispatches `Profiler.enable`, so `Profiler.startPreciseCoverage` is unreachable,
  and the one coverage call it does forward (`getBestEffortCoverage`) has binary
  saturating counts that cannot be turned into per-request deltas. Instrumenting at
  build time sidesteps that, and because the per-request sink lives on the shim's
  existing AsyncLocalStorage store, hits are attributed to exactly one session even
  though workerd interleaves concurrent requests in one isolate.

  Add the plugin to the build you upload for testing, not the one you deploy:

  ```ts
  import { meticulousCoverage } from "@alwaysmeticulous/backend-recorder-workerd/vite";
  export default defineConfig({ plugins: [meticulousCoverage()] });
  ```

  Reported lines are lines in the customer's source. The plugin runs after the
  build's own TypeScript/JSX pass, which re-prints each module and drops comments
  and blank lines, so it resolves each marker back through that pass's source map;
  without that, a commented codebase reports nearly every line short by however
  much was stripped above it.

  A code-split app registers its modules as their chunks are imported rather than
  at startup, so both halves of the reporting follow the load order: a request's
  sink grows when it imports a module (which is what covers the very first render
  on a cold isolate, before anything has registered), and the id→line map is sent
  incrementally as blocks appear, retried until the sidecar acknowledges them.

  The instrumented bundle is safe to run with coverage off — every marker is a
  no-op when no sink is present — and a module the plugin cannot parse is passed
  through untouched rather than failing the build.

### Patch Changes

- [#12466](https://github.com/alwaysmeticulous/meticulous/pull/12466) [`454042f`](https://github.com/alwaysmeticulous/meticulous/commit/454042f1d259df6a64602056fb898599a7940253) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Stamp the bundled workerd shim version on app responses so test runs can show a banner when head and base used different versions.

## 2.327.0

### Patch Changes

- [#12342](https://github.com/alwaysmeticulous/meticulous/pull/12342) [`aa46fab`](https://github.com/alwaysmeticulous/meticulous/commit/aa46fabc842b03c203a1773f5df7e65e09e185c9) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Replay is now fully hermetic: an outbound fetch the recording does not cover — a miss, a call the sidecar cannot look up, or an unrecognised sidecar outcome — fails the call instead of passing it through to the real service. The only path to a live call remains the explicit `meticulous-passthrough: true` request header.

- [#12380](https://github.com/alwaysmeticulous/meticulous/pull/12380) [`e277287`](https://github.com/alwaysmeticulous/meticulous/commit/e2772871291e48afeb277016288d525061b3ed1a) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - Reset replay randomness sequences on each inbound request instead of sharing one stream across the replay. Each call site returns a fixed 0.3142 for the first 1,000 draws and only then starts a seeded PRNG, so a Fisher-Yates shuffle is identical in every replay and a `while (Math.random() < 0.5)` loop still terminates. The seed stays session-scoped, so base and head still match.

- [#12355](https://github.com/alwaysmeticulous/meticulous/pull/12355) [`16486b4`](https://github.com/alwaysmeticulous/meticulous/commit/16486b46889de770883b4527b7968a1bd20c3452) Thanks [@narobertson42](https://github.com/narobertson42)! - Key the replay randomness state by replay id rather than session id. An isolate outlives a single replay, so a second replay of the same recording — a retry, or the same session scheduled again — continued the first replay's number sequences instead of restarting them, drew different values, and rendered differently. The seed stays session-scoped, so every replay of a recording still draws the identical sequence.

## 2.326.0

### Minor Changes

- [#12203](https://github.com/alwaysmeticulous/meticulous/pull/12203) [`78da03a`](https://github.com/alwaysmeticulous/meticulous/commit/78da03ae2ba6c9451d1dd730008fee465767fe06) Thanks [@dennysem](https://github.com/dennysem)! - Backend recording now works from a **deployed** Cloudflare Worker or Pages project, not just `wrangler dev`.
  - New `@alwaysmeticulous/backend-recorder-sidecar-worker`: the recorder sidecar as a Worker you deploy into your own Cloudflare account. Your app reaches it through a `METICULOUS_SIDECAR` service binding; a Durable Object buffers reports and uploads finished session chunks to Meticulous.
  - `withMeticulous` now activates on that service binding as well as on the `METICULOUS_SIDECAR_URL` var, and batches a request's capture events into one report instead of one per captured call.
  - New `withMeticulousPagesFunction`, for a Cloudflare Pages project whose worker exports `onRequest` rather than `{ fetch }`.
  - New `withMeticulousPostgres`, which records postgres.js queries (typically over Hyperdrive) from a deployed Worker. The captured spans are identical to the Node recorder's, so these recordings replay through the existing path.

- [#12135](https://github.com/alwaysmeticulous/meticulous/pull/12135) [`8ab6eab`](https://github.com/alwaysmeticulous/meticulous/commit/8ab6eabdb3d6ac70346462e4ecbf8176f7bc7fe4) Thanks [@dennysem](https://github.com/dennysem)! - The shim now mints a session id for a page's initial document navigation — the one request a browser cannot tag with `x-meticulous-session-id` — so the server-side render and everything it calls are recorded under the same session as the page it produces. The id is published on a `Server-Timing: metsession` response header, which the frontend recorder adopts, and is also readable from the new `getMeticulousSessionId()` export for an app that wants to render it into its HTML or forward it to another service. On by default while recording; opt out with `mintProvisionalSessionIds: false` or a `METICULOUS_BACKEND_PROVISIONAL_SESSION_IDS` var of `"false"`.

### Patch Changes

- [#12267](https://github.com/alwaysmeticulous/meticulous/pull/12267) [`46416ce`](https://github.com/alwaysmeticulous/meticulous/commit/46416ce1369e81de4731fb8e650f8ed29740baf3) Thanks [@calebgcc](https://github.com/calebgcc)! - Include the replay id in sidecar mock lookups so separate replays of one recorded session consume their backend responses independently.

## 2.325.0

### Minor Changes

- [#12027](https://github.com/alwaysmeticulous/meticulous/pull/12027) [`3837dd1`](https://github.com/alwaysmeticulous/meticulous/commit/3837dd1645cbf2c47c6fcc0cf11d907204ca9b72) Thanks [@dennysem](https://github.com/dennysem)! - Record and replay Cloudflare bindings from an app running on Node.

  An app that runs on Node but gets its bindings from Cloudflare — a React Router or TanStack Start dev server or container using `cloudflareDevProxy`, or anything else built on wrangler's `getPlatformProxy` — can now hand its `env` to the recorder: `const env = handle.withMeticulousCloudflareEnv(context.cloudflare.env)`. JS-RPC methods, KV operations, queue sends and `fetch` through a service binding or Durable Object stub are recorded, and all but R2 are served back during a replay, so a replay no longer needs the sibling workers running or the local KV contents to match the recording. R2 calls are recorded but still run for real.

  There was previously no seam for this at all: in that setup each binding is a proxy object created per process, so no require hook can reach it and there is no prototype to patch, unlike in a deployed Worker.

  `@alwaysmeticulous/backend-recorder-workerd` now exports `serializeKvCaptureFields` and `serializeKvArgs`, which define how a KV operation's key, arguments and value are persisted. The Node recorder calls them so a KV operation recorded in Node is byte-identical to the same one recorded in workerd, and either recording can be replayed by either runtime.

## 2.324.0

### Patch Changes

- [#11841](https://github.com/alwaysmeticulous/meticulous/pull/11841) [`a9b9ca8`](https://github.com/alwaysmeticulous/meticulous/commit/a9b9ca864a5ef6de85a908fd6930ecff27426778) Thanks [@dennysem](https://github.com/dennysem)! - Freeze the replay clock at a fixed fallback date (13 May 2026) for a replayed request whose session carries no clock anchor, instead of leaving it on live wall-clock time. Live time there differed between two replays of the same session, which is the non-determinism the replay clock exists to remove. Recordings and deployed production workers are unaffected — they still read the real clock.

## 2.323.0

### Minor Changes

- [#11692](https://github.com/alwaysmeticulous/meticulous/pull/11692) [`8c0d99a`](https://github.com/alwaysmeticulous/meticulous/commit/8c0d99a58fd15783527a36440fce952532c31cc9) Thanks [@dennysem](https://github.com/dennysem)! - Replay is now hermetic: an outgoing `fetch` the recording does not cover fails with a `[backend-recorder] workerd replay: …` error instead of quietly reaching the real service, matching the Node backend recorder's http/undici mocks. Set the `meticulous-passthrough` header to `"true"` on a request that must stay live during a replay.

### Patch Changes

- [#11817](https://github.com/alwaysmeticulous/meticulous/pull/11817) [`a4c293a`](https://github.com/alwaysmeticulous/meticulous/commit/a4c293a697d5eb9c15f33e1d38dbaa1e4a6e2fdc) Thanks [@dennysem](https://github.com/dennysem)! - Bound the shim's capture-event POST to the sidecar with a 2s timeout, so a sidecar that drops packets rather than refusing them cannot hold the worker's request context open on every captured call. The replay lookups were already bounded; record-mode reporting was not.

  All three sidecar calls now use a clearable timer rather than `AbortSignal.timeout`, whose timer cannot be cancelled and so keeps the worker's request context alive for the full timeout even after the call has settled.

## 2.321.0

### Minor Changes

- [#11619](https://github.com/alwaysmeticulous/meticulous/pull/11619) [`56ae3c9`](https://github.com/alwaysmeticulous/meticulous/commit/56ae3c9ee60845b3a7b061ee866deef678523ae9) Thanks [@dennysem](https://github.com/dennysem)! - Seed the worker's random number generation during replay, so ids the app mints on the server
  are identical in every replay of a recorded session. `Math.random`, `crypto.randomUUID` and
  `crypto.getRandomValues` are replaced with per-session seeded generators for the duration of a
  replayed request, alongside the existing virtual clock. Without this a value like a guest id
  minted during SSR differs between a base and a head replay, so every screenshot showing it
  diffs forever even when all outbound calls are mocked correctly.

  The design mirrors the browser replayer's: a separate sequence per call stack, seeded from a
  per-call-site counter, so a change in one part of the app does not shift the numbers another
  part gets, and a shared id helper called from two places still returns two different ids. The
  session id is part of the seed, so different recordings do not mint colliding ids. Recording,
  and any deployed worker that is not serving a replay, keeps the platform's own generators
  untouched.

- [#11617](https://github.com/alwaysmeticulous/meticulous/pull/11617) [`ce80a69`](https://github.com/alwaysmeticulous/meticulous/commit/ce80a69f5aa7243e288f6961c7e841e56a1e9866) Thanks [@dennysem](https://github.com/dennysem)! - Record Cloudflare KV namespace operations. `get`, `getWithMetadata`, `put`, `delete` and
  `list` on a namespace found on `env` are now captured as CLIENT spans tagged
  `clientTechnology: "workerd-kv"` and named `kv.<binding>.<operation>`, carrying the binding
  name, the key, the call's arguments and the value as JSON — so a single `JSON.parse`
  reconstructs exactly what the app saw, whichever `type` the read asked for. No app change is
  required beyond the existing `withMeticulous` wrapper: the namespace's prototype methods are
  instrumented wherever the app reads the binding from, including via `cloudflare:workers`.

  A KV operation is not Request/Response-shaped, so these spans carry `meticulous.workerd.kv.*`
  attributes following the Prisma/ioredis contract rather than HTTP attributes, and they are kept
  apart from `workerd-fetch` and `workerd-binding` for the same reason those two are kept apart.
  Still record-only: no mock store serves KV yet, so KV reads reach the real namespace during a
  replay.

  A `put` value is redacted like a request body, while a value read back is stored verbatim like
  a response body. A value read as a stream is recognised but never read — consuming it would
  take the bytes from the app — and binary values are skipped; both are recorded with an
  `omitted` reason in place of the value. `options.skipBindings` now also skips KV namespaces.

## 2.319.0

### Minor Changes

- [#11533](https://github.com/alwaysmeticulous/meticulous/pull/11533) [`4bc27fe`](https://github.com/alwaysmeticulous/meticulous/commit/4bc27fed7e2e3b837cb10738dd9e4df5754e3a2b) Thanks [@dennysem](https://github.com/dennysem)! - Add replay support to the workerd shim. `withMeticulous` now also serves recorded responses
  to the app's outgoing `fetch` calls instead of letting them reach the real service, and
  freezes the worker's clock at the recorded session's end so credentials minted during the
  recording are still valid.

  Replay activates on the `x-meticulous-backend-replay-sidecar-url` header, injected by the
  Meticulous replay runner — workerd cannot read container environment variables, so per-replay
  config has to arrive per request. The shim validates the value and only honours a plain
  `http:` origin on a loopback, docker-gateway or RFC1918 host — link-local is rejected, so a
  forged header cannot steer replay traffic at a cloud metadata endpoint. Replay takes
  precedence over recording when both are configured. With neither, the wrapper remains a
  complete pass-through.

  Calls through a Cloudflare binding (`env.SVC.fetch(...)`) are recorded but not yet replayed:
  they are captured as their own technology (`workerd-binding`), which the mock store does not
  serve, so during a replay they reach the real binding. Only `globalThis.fetch` is mocked.

  `@alwaysmeticulous/api` gains `SerializedBackendSpan.clientTechnology` and the
  `WORKERD_FETCH_CLIENT_TECHNOLOGY` constant, so a replay can tell a workerd recording from a
  Node one and only start the out-of-process mock store for the former.

- [#11560](https://github.com/alwaysmeticulous/meticulous/pull/11560) [`3900864`](https://github.com/alwaysmeticulous/meticulous/commit/39008647d37945107ea674ed83366ec43c7e88cf) Thanks [@dennysem](https://github.com/dennysem)! - Record calls made through Cloudflare bindings. Service-binding and Durable Object `fetch`
  calls are now captured as CLIENT spans alongside ordinary `fetch` egress, tagged with the
  `env` key they went through. No app change is required beyond the existing `withMeticulous`
  wrapper: the shared prototype behind `fetch`-shaped bindings is instrumented, so the call is
  recorded wherever the app reads the binding from — including via `cloudflare:workers` rather
  than the handler's `env` argument.

  Assets bindings (`ASSETS`, `__STATIC_CONTENT`) are skipped by default, and
  `options.skipBindings` skips others.

  Also redacts secret-looking JSON fields (`clientSecret`, `apiKey`, `token`, `password`, …)
  from captured **request** bodies before they leave the worker, for APIs that carry a
  credential in the body rather than a header. Response bodies are unchanged.

## 2.315.0

### Minor Changes

- [#11317](https://github.com/alwaysmeticulous/meticulous/pull/11317) [`f92d563`](https://github.com/alwaysmeticulous/meticulous/commit/f92d5637fbaf6ca1941394185db539f80c9d2aaf) Thanks [@alexivanov](https://github.com/alexivanov)! - Add backend session recording for Cloudflare Workers (workerd) apps during local development. The new `@alwaysmeticulous/backend-recorder-workerd` package provides a `withMeticulous` handler wrapper that captures inbound requests and outgoing `fetch` calls, and the new `meticulous record backend` CLI command starts the Meticulous recorder sidecar and wraps your dev command (e.g. `meticulous record backend -- npx wrangler dev`).
