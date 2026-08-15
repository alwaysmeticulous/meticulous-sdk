# @alwaysmeticulous/backend-recorder-sidecar-worker

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
