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

## Limitations

- Only `fetch` egress is captured. Bindings (KV, D1, R2, Durable Objects, service bindings), WebSockets, and TCP sockets are not captured.
- `fetch` calls made outside a request handled by `withMeticulous` (e.g. in `scheduled` handlers) are not captured.
