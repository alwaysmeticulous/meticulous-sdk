# Meticulous Backend Recorder for Cloudflare Workers (workerd)

In-worker shim for recording backend sessions from Cloudflare Workers during **local development** (`wrangler dev`). It reports the worker's inbound requests and outgoing `fetch` calls (including request/response bodies, capped at 256 KB) as capture events to a local Meticulous recorder sidecar process, which turns them into backend session recordings.

The shim is passive: outgoing requests go straight to their real destination; the sidecar is never in the request path, and an unreachable sidecar or any capture failure never affects your app.

## Setup

1. Install the shim:

   ```bash
   npm install @alwaysmeticulous/backend-recorder-workerd
   ```

2. Wrap your ES-module Worker handler:

   ```ts
   import { withMeticulous } from "@alwaysmeticulous/backend-recorder-workerd";

   export default withMeticulous({
     async fetch(request, env, ctx) {
       // your app
     },
   });
   ```

3. Enable the `nodejs_als` (or `nodejs_compat`) compatibility flag in `wrangler.toml`:

   ```toml
   compatibility_flags = ["nodejs_als"]
   ```

4. Run your dev command through the Meticulous CLI, which starts the recorder sidecar and passes its URL to `wrangler dev` automatically:

   ```bash
   npx @alwaysmeticulous/cli record backend -- npx wrangler dev
   ```

   Or run the sidecar standalone with `npx @alwaysmeticulous/cli record backend` and point the shim at it yourself — the value must be a worker var/binding (host environment variables are not visible inside workerd), e.g. in `.dev.vars`:

   ```
   METICULOUS_SIDECAR_URL=http://127.0.0.1:9670
   ```

   or `wrangler dev --var METICULOUS_SIDECAR_URL:http://127.0.0.1:9670`.

Without `METICULOUS_SIDECAR_URL` (or `options.sidecarUrl`) the wrapper is a complete pass-through, so it is safe to leave in code that gets deployed.

## What is captured

- **Inbound requests** (method, URL, headers, status; no bodies), correlated to the frontend session via the `x-meticulous-session-id` header stamped by the Meticulous frontend recorder.
- **Outgoing `fetch` calls** made while handling an inbound request: method, URL, headers, status, and request/response bodies (UTF-8, capped at 256 KB; long-lived streams such as SSE are captured truncated).
- **Calls through `fetch`-shaped bindings** — service bindings and Durable Object stubs — recorded like outgoing fetches, plus the `env` key the call went through. No code change is needed: the binding's `fetch` is instrumented wherever the app reads it from, including via `cloudflare:workers` rather than the handler's `env` argument.
- **KV namespace operations** — `get`, `getWithMetadata`, `put`, `delete` and `list` on a namespace found on `env`, recorded with the binding name, the key, the call's arguments and the value as JSON (so one `JSON.parse` reconstructs exactly what the app saw, whichever `type` the read asked for). Also no code change needed. A value read as a stream is never read by the recorder — that would take the bytes from the app — and binary values are skipped; both cases are recorded with the reason instead of the value.

Request bodies have secret-looking JSON fields (`clientSecret`, `apiKey`, `token`, `password`, …) replaced with `REDACTED` before they leave the worker, since plenty of APIs carry a credential in the body rather than a header. Response bodies are stored verbatim. A KV `put` value is redacted the same way, for the same reason; a value read back from KV is stored verbatim, like a response body.

## Limitations

- Bindings other than `fetch`-shaped ones and KV namespaces are not captured: D1, R2, Queues, and RPC method calls on a named entrypoint (`env.SVC.someMethod()`) — an RPC method is not a patchable property, so it cannot be intercepted this way.
- A KV value that is not text is recorded without its value: reading a `stream` would take the bytes away from the app, and binary values are skipped because KV blobs are large and not UTF-8. The operation, key and arguments are still recorded, with `omitted` saying which case it was.
- Assets bindings are skipped by default (`ASSETS`, `__STATIC_CONTENT`): asset bytes are large and often binary, and asset serving is usually a worker's highest-volume call. Use `options.skipBindings` to skip others.
- A Durable Object stub is recorded without a binding name, since the stub comes from `namespace.get()` rather than being a binding itself.
- A binding reference bound before the first instrumented request (`const f = env.SVC.fetch.bind(env.SVC)` at module scope) escapes instrumentation. Holding the binding _object_ and calling `.fetch()` on it per request — what SDKs normally do — is captured.
- WebSocket upgrades and TCP sockets (`connect()`) are not captured.
- `fetch` calls made outside a request handled by `withMeticulous` (e.g. in `scheduled` handlers) are not captured.
