# @alwaysmeticulous/backend-recorder-sidecar-worker

## 2.334.0

### Patch Changes

- [#12864](https://github.com/alwaysmeticulous/meticulous/pull/12864) [`eb44010`](https://github.com/alwaysmeticulous/meticulous/commit/eb4401080587c0bd6cbb87e10d72f3ec67e7f75e) Thanks [@dennysem](https://github.com/dennysem)! - Stop recording container health probes. A GET or HEAD to a conventional probe path (`/health`, `/healthz`, `/healthcheck`, `/health-check`, `/_health`, `/api/health`, `/api/healthz`, `/readyz`, `/livez`, `/ping`) that carries no `x-meticulous-session-id` never enters the capture context, so neither the inbound request nor the outgoing `fetch`, binding and KV calls it fans out to are reported. A Kubernetes probe or load balancer polls these for the lifetime of the pod with no session identity, so the spans could never be replayed and served only to add noise to ingestion's time-window attachment fallback.

  A request that names its session is real app traffic whatever its path, so an app that serves `/api/health` as a page's data source keeps recording it — which also means this can only drop spans that ingestion's session-id match would have discarded anyway. Record mode only: a replay is unaffected.

  The sidecar repeats the same verdict on the events it receives, dropping the inbound event and everything sharing its `requestId`. That is what lets the exclusion reach an app whose bundled shim predates this release: redeploying the sidecar Worker needs no change to the app, whereas the shim-side check only takes effect once the shim is bumped in the app's own bundle and the app is redeployed. Against an up-to-date shim it is a no-op, since no probe is ever reported.

- Updated dependencies [[`eb44010`](https://github.com/alwaysmeticulous/meticulous/commit/eb4401080587c0bd6cbb87e10d72f3ec67e7f75e)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.334.0

## 2.333.1

### Patch Changes

- [#12849](https://github.com/alwaysmeticulous/meticulous/pull/12849) [`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df) Thanks [@edoardopirovano](https://github.com/edoardopirovano)! - No-op patch release of every public package.

- Updated dependencies [[`a275471`](https://github.com/alwaysmeticulous/meticulous/commit/a275471c200f7bc0c63a1002d65cdfdf7681b3df)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.333.1

## 2.333.0

### Patch Changes

- Updated dependencies [[`d177020`](https://github.com/alwaysmeticulous/meticulous/commit/d177020f79a3a74e4476eefa10be2fcc03c97428)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.333.0

## 2.331.3

### Patch Changes

- Updated dependencies [[`4a74a3d`](https://github.com/alwaysmeticulous/meticulous/commit/4a74a3dc934f44e38ff2c4ea7bacfd4162f24950)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.331.3

## 2.331.0

### Patch Changes

- Updated dependencies [[`8bee1d0`](https://github.com/alwaysmeticulous/meticulous/commit/8bee1d0cc1a2b33d7ce9b3c6aa403ace0427bb91)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.331.0

## 2.330.0

### Patch Changes

- Updated dependencies [[`35bd171`](https://github.com/alwaysmeticulous/meticulous/commit/35bd1712f0d55018bcf69587e910f1e9aa2a4b2e)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.330.0

## 2.329.0

### Patch Changes

- Updated dependencies [[`facc68c`](https://github.com/alwaysmeticulous/meticulous/commit/facc68cc4fb26d8d8a9861ffb2cf8ee7f13043ea), [`eeba9b5`](https://github.com/alwaysmeticulous/meticulous/commit/eeba9b506e0592545b15b3daa22dbee9b6373044), [`454042f`](https://github.com/alwaysmeticulous/meticulous/commit/454042f1d259df6a64602056fb898599a7940253)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.329.0

## 2.327.0

### Patch Changes

- Updated dependencies [[`aa46fab`](https://github.com/alwaysmeticulous/meticulous/commit/aa46fabc842b03c203a1773f5df7e65e09e185c9), [`e277287`](https://github.com/alwaysmeticulous/meticulous/commit/e2772871291e48afeb277016288d525061b3ed1a), [`16486b4`](https://github.com/alwaysmeticulous/meticulous/commit/16486b46889de770883b4527b7968a1bd20c3452)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.327.0

## 2.326.2

### Patch Changes

- [#12321](https://github.com/alwaysmeticulous/meticulous/pull/12321) [`75c0228`](https://github.com/alwaysmeticulous/meticulous/commit/75c0228e9ecc2784fb86c35242c41076bae23cb7) Thanks [@dennysem](https://github.com/dennysem)! - Republish the Cloudflare sidecar worker.

## 2.326.0

### Minor Changes

- [#12203](https://github.com/alwaysmeticulous/meticulous/pull/12203) [`78da03a`](https://github.com/alwaysmeticulous/meticulous/commit/78da03ae2ba6c9451d1dd730008fee465767fe06) Thanks [@dennysem](https://github.com/dennysem)! - Backend recording now works from a **deployed** Cloudflare Worker or Pages project, not just `wrangler dev`.
  - New `@alwaysmeticulous/backend-recorder-sidecar-worker`: the recorder sidecar as a Worker you deploy into your own Cloudflare account. Your app reaches it through a `METICULOUS_SIDECAR` service binding; a Durable Object buffers reports and uploads finished session chunks to Meticulous.
  - `withMeticulous` now activates on that service binding as well as on the `METICULOUS_SIDECAR_URL` var, and batches a request's capture events into one report instead of one per captured call.
  - New `withMeticulousPagesFunction`, for a Cloudflare Pages project whose worker exports `onRequest` rather than `{ fetch }`.
  - New `withMeticulousPostgres`, which records postgres.js queries (typically over Hyperdrive) from a deployed Worker. The captured spans are identical to the Node recorder's, so these recordings replay through the existing path.

### Patch Changes

- [#12278](https://github.com/alwaysmeticulous/meticulous/pull/12278) [`d931e83`](https://github.com/alwaysmeticulous/meticulous/commit/d931e8394ed45e2e2aadd8771a7e51f871c3a357) Thanks [@dennysem](https://github.com/dennysem)! - The `recorderVersion` written onto every session's `metadata.json` is now the commit the sidecar was last changed in, resolved at build time, matching how the Node recorder fills the same field. It had been a hand-maintained literal that nothing regenerated, so it was frozen at the version it was first authored with — defeating the point of recording it: tracing a recording back to the sidecar that produced it, and spotting a deployed sidecar older than the shim reporting to it.

- Updated dependencies [[`46416ce`](https://github.com/alwaysmeticulous/meticulous/commit/46416ce1369e81de4731fb8e650f8ed29740baf3), [`78da03a`](https://github.com/alwaysmeticulous/meticulous/commit/78da03ae2ba6c9451d1dd730008fee465767fe06), [`8ab6eab`](https://github.com/alwaysmeticulous/meticulous/commit/8ab6eabdb3d6ac70346462e4ecbf8176f7bc7fe4)]:
  - @alwaysmeticulous/backend-recorder-workerd@2.326.0
