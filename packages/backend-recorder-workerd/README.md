# Meticulous Backend Recorder for Cloudflare Workers (workerd)

In-worker shim for recording backend sessions from Cloudflare Workers — during local development (`wrangler dev`), and from a **deployed** Worker or Pages project. It reports the worker's inbound requests, outgoing `fetch` calls (including request/response bodies, capped at 256 KB), binding and KV calls and postgres.js queries as capture events to a Meticulous recorder sidecar, which turns them into backend session recordings.

The shim is passive: outgoing requests go straight to their real destination; the sidecar is never in the request path, and an unreachable sidecar or any capture failure never affects your app.

Where the sidecar lives is the only difference between the two setups:

|                                                                 | Sidecar                                                                                                                                                                           | Configured by                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `wrangler dev`                                                  | a local process (`npx @alwaysmeticulous/cli record backend`)                                                                                                                      | the `METICULOUS_SIDECAR_URL` var       |
| deployed (`wrangler deploy`, `wrangler pages deploy`, previews) | [`@alwaysmeticulous/backend-recorder-sidecar-worker`](https://www.npmjs.com/package/@alwaysmeticulous/backend-recorder-sidecar-worker), deployed into your own Cloudflare account | a `METICULOUS_SIDECAR` service binding |

## Setup for local development

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

   If the recorder cannot start — no credentials, no network to fetch the sidecar bundle, an unusable port — the CLI warns and runs your dev command unrecorded rather than failing, so this is safe to leave in a `dev` script.

   Or run the sidecar standalone with `npx @alwaysmeticulous/cli record backend` and point the shim at it yourself — the value must be a worker var/binding (host environment variables are not visible inside workerd), e.g. in `.dev.vars`:

   ```
   METICULOUS_SIDECAR_URL=http://127.0.0.1:9670
   ```

   or `wrangler dev --var METICULOUS_SIDECAR_URL:http://127.0.0.1:9670`.

Without a sidecar configured the wrapper is a complete pass-through, so it is safe to leave in code that gets deployed.

## Setup for a deployed Worker or Pages project

1. Deploy the sidecar into your own Cloudflare account, following the [`@alwaysmeticulous/backend-recorder-sidecar-worker`](https://www.npmjs.com/package/@alwaysmeticulous/backend-recorder-sidecar-worker) README. It is one file and one `wrangler deploy`.

2. Add a service binding to your app, in every environment you want recorded:

   ```toml
   [[services]]
   binding = "METICULOUS_SIDECAR"
   service = "meticulous-recorder-sidecar"
   ```

3. Wrap your handler. For an ES-module Worker that is `withMeticulous`, as above. For a **Cloudflare Pages** project, whose worker exports `onRequest` rather than `{ fetch }`, use `withMeticulousPagesFunction`:

   ```ts
   import { withMeticulousPagesFunction } from "@alwaysmeticulous/backend-recorder-workerd";

   export const onRequest = withMeticulousPagesFunction(handler);
   ```

   Apply it **outermost**, before any wrapper of your own that re-writes `context.env`: the recorder discovers bindings on the `env` it is handed, so a wrapper substituting its own façades first would hide the real instances.

4. If your app queries Postgres — over Hyperdrive, say — hand us the client so its queries are recorded too. There is no seam to patch automatically in a Worker: `postgres` was inlined into your bundle at build time and never passes through a module loader.

   ```ts
   import { withMeticulousPostgres } from "@alwaysmeticulous/backend-recorder-workerd";

   const sql = withMeticulousPostgres(
     postgres(env.HYPERDRIVE.connectionString),
   );
   ```

   One call covers every client in the isolate, and it returns the client unchanged. Apply it outermost if something else also wraps the client (Sentry's `instrumentPostgresJsSql`, a logging proxy).

Nothing needs to change between environments: the wrapper activates on whichever sidecar it finds, and a deployment with neither configured is a pass-through. A binding wins over a `METICULOUS_SIDECAR_URL` var when both are present, since only the binding can have been added to that deployment's wrangler configuration deliberately.

A request's capture events are batched into **one** report, sent under `ctx.waitUntil` after your response has gone out — so an SSR request making twenty calls costs one round trip, not twenty.

## What is captured

- **Inbound requests** (method, URL, headers, status; no bodies), correlated to the frontend session via the `x-meticulous-session-id` header stamped by the Meticulous frontend recorder — or, for the page's initial navigation, via an id the shim mints itself (see [Session ids for the first page render](#session-ids-for-the-first-page-render)).
- **Outgoing `fetch` calls** made while handling an inbound request: method, URL, headers, status, and request/response bodies (UTF-8, capped at 256 KB; long-lived streams such as SSE are captured truncated).
- **Calls through `fetch`-shaped bindings** — service bindings and Durable Object stubs — recorded like outgoing fetches, plus the `env` key the call went through. No code change is needed: the binding's `fetch` is instrumented wherever the app reads it from, including via `cloudflare:workers` rather than the handler's `env` argument.
- **KV namespace operations** — `get`, `getWithMetadata`, `put`, `delete` and `list` on a namespace found on `env`, recorded with the binding name, the key, the call's arguments and the value as JSON (so one `JSON.parse` reconstructs exactly what the app saw, whichever `type` the read asked for). Also no code change needed. A value read as a stream is never read by the recorder — that would take the bytes from the app — and binary values are skipped; both cases are recorded with the reason instead of the value.
- **postgres.js queries**, when you apply `withMeticulousPostgres` (see above): the SQL with `$1`-style placeholders, the interpolated parameters, the row shape the query asked for, and the resolved rows — or the error, so a query that legitimately failed replays as the same failure rather than as a gap. Cursors, `.forEach()`, COPY streams and `.describe()` pass through unrecorded, since they do not resolve with a single result.

## Session ids for the first page render

A browser cannot put a custom header on a top-level navigation, and on the navigation that starts a session the frontend recorder has not minted an id yet — it does that only once the HTML has arrived and the snippet has run. So the request that produces your server-side render is the one request that can never arrive tagged, and everything it does (the render's own `fetch` calls, its binding and KV reads) would be recorded against no session at all.

The shim closes that gap from the other end: for such a request it **mints the session id itself**, records the whole request under it, and publishes it to the page, which adopts it instead of minting its own. The entire page load then sits under one session id.

**When it mints.** Only for what is plausibly a browser navigating to a page: a `GET`/`HEAD` with `Sec-Fetch-Dest: document` (or, absent that header, an `Accept` containing `text/html`) and no inbound `x-meticulous-session-id`. An in-page `fetch`, an RSC navigation, an iframe, a health check and a crawler all decline. It only ever happens while recording, so a deployed worker with no sidecar configured is untouched.

**How the page learns it.** Two channels, either sufficient:

1. `Server-Timing: metsession;desc="<id>"` on the response. The recorder reads it from `performance.getEntriesByType("navigation")[0].serverTiming` — the one response header a document's own script can read back, and it persists for the document's lifetime, so this works however late the snippet loads. **No app change needed.** Restricted to secure contexts, and a cache or proxy may strip it.
2. Your app renders it, via `getMeticulousSessionId()` — typically as `data-session-id` on the recorder's own `<script>` tag (`window.METICULOUS_SESSION_ID` also works). Exact and immune to header caching; costs one line.

```ts
import {
  getMeticulousSessionId,
  withMeticulous,
} from "@alwaysmeticulous/backend-recorder-workerd";

export default withMeticulous({
  async fetch() {
    const sessionId = getMeticulousSessionId();
    return new Response(
      `<script src="/recorder.js" data-session-id="${escapeHtml(sessionId ?? "")}"></script>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
```

Escape it as you would any other value you interpolate into markup: on a document navigation it is our own minted id, but on any other request it is the inbound header verbatim.

Either way the recorder adopts an id only while its mint time is **within 60s of now, in either direction** (session ids embed their mint time). That bound is what stops a response cached at a CDN or by the browser from handing one session id to every visitor who receives it. Within the window that sharing is still possible, so **an app whose HTML is cacheable is not yet a good candidate** — turn minting off there:

```ts
export default withMeticulous(handler, { mintProvisionalSessionIds: false });
```

or set the `METICULOUS_BACKEND_PROVISIONAL_SESSION_IDS` var to `"false"` (a worker var/binding, like `METICULOUS_SIDECAR_URL` — host environment variables are not visible inside workerd).

`getMeticulousSessionId()` is also how the id reaches another process. A document navigation has no inbound header for your app to forward, so a worker that fans out to its own services has to pass the id on as `x-meticulous-session-id` itself; the shim does not add it to outbound requests.

Request bodies have secret-looking JSON fields (`clientSecret`, `apiKey`, `token`, `password`, …) replaced with `REDACTED` before they leave the worker, since plenty of APIs carry a credential in the body rather than a header. Response bodies are stored verbatim. A KV `put` value is redacted the same way, for the same reason; a value read back from KV is stored verbatim, like a response body.

## Replay

The same wrapper serves the recording back when Meticulous replays a session against your app: outgoing `fetch` calls are answered from the recording instead of reaching the real service, the clock is frozen at the recorded session's end, and `Math.random` / `crypto.randomUUID` / `crypto.getRandomValues` are seeded so ids the app mints are identical in every replay. Replay is activated by a header the Meticulous replay runner injects, so nothing extra is needed to enable it.

Replay is **hermetic**: a call the recording does not cover fails with a `[backend-recorder] workerd replay: …` error rather than quietly reaching the real service, so a gap in the recording surfaces instead of turning a replay into live traffic. For a call that must stay live during a replay, set the `meticulous-passthrough` header to `true` on the request:

```ts
await fetch(url, { headers: { "meticulous-passthrough": "true" } });
```

While serving a replay, the shim prefixes request-scoped `console.debug`, `console.log`,
`console.info`, `console.warn`, `console.error`, and `console.trace` output with the active replay
ID. Each request reads its own ID from `AsyncLocalStorage`, so logs stay correctly attributed when
one Worker isolate serves concurrent replays. Startup and other work outside a replay request stays
untagged.

Calls through bindings and KV namespaces are not served from the recording (see Limitations) and are never failed — they always reach the real binding.

## Code coverage

Meticulous can report which of your server lines each replayed session executed. Workerd exposes no usable V8 coverage — its inspector never dispatches `Profiler.enable`, so `Profiler.startPreciseCoverage` is unreachable, and the one coverage call it does forward reports binary counts that never reset, which cannot be split per request. So the lines are marked at build time instead.

Add the plugin to the build you **upload for testing**, not the one you deploy:

```ts
import { defineConfig } from "vite";
import { meticulousCoverage } from "@alwaysmeticulous/backend-recorder-workerd/vite";

export default defineConfig({
  plugins: [meticulousCoverage()],
});
```

Then replays report coverage automatically — the wrapper posts the lines each request ran to the Meticulous replay sidecar, which attributes them to that session.

- Only **server** modules are instrumented; the client build is untouched unless you pass `includeClient: true`.
- `node_modules` and virtual modules are always skipped. `exclude: [/pattern/]` skips more.
- The instrumented bundle is safe to run with coverage off: every marker is a no-op when nothing is collecting, so the same image still works for ordinary replays and for local development.
- A module the plugin cannot parse is passed through unchanged. Coverage is never worth failing your build for.
- Some lines are deliberately not marked, because marking them would mean rewriting code rather than adding to it: statements at module top level (they run at isolate startup, outside any request), class `static` blocks, the body of a braceless single statement such as `if (x) return;`, and the condition of an `else if` (only the first `if` of a chain gets a marker, though every branch body still gets its own). Those lines therefore read as uncovered even in a run that executed them.

Reported line numbers are lines in your source, not in the bundle. The plugin runs after your build's TypeScript/JSX pass, which re-prints each module and drops comments and blank lines — so it resolves every line back through that pass's source map. Two consequences worth knowing:

- A module whose source map your build does not produce is still instrumented, but its lines are reported as the build printed them. The plugin says how many modules this affected at the end of the build.
- A module whose source map covers some other file is skipped entirely rather than reported against the wrong lines.

Because each function re-reads the current request's sink, a callback that outlives the request that created it is credited to the request that actually runs it, not the one that built it.

## Limitations

- Streamed responses are captured truncated: the inbound request is reported once the handler returns, which for a streamed response is before the stream ends, and outbound bodies cap at 256 KB. An app whose main endpoints are SSE will not record them faithfully.
- Bindings other than `fetch`-shaped ones and KV namespaces are not captured: D1, R2, Queues, and RPC method calls on a named entrypoint (`env.SVC.someMethod()`) — an RPC method is not a patchable property, so it cannot be intercepted this way.
- A KV value that is not text is recorded without its value: reading a `stream` would take the bytes away from the app, and binary values are skipped because KV blobs are large and not UTF-8. The operation, key and arguments are still recorded, with `omitted` saying which case it was.
- Assets bindings are skipped by default (`ASSETS`, `__STATIC_CONTENT`): asset bytes are large and often binary, and asset serving is usually a worker's highest-volume call. Use `options.skipBindings` to skip others.
- An outbound `fetch` headed for a Datadog agent, carrying no frontend session id, is recorded as nothing. A tracer flushes on its own timer, so nothing can attribute the call, and the payload is every span it had buffered. A destination counts as the agent only when its port is `8126` **and** its path is one of the agent's own API endpoints (`/info`, `/v0.4/traces` and the rest of that family, `/profiling/v1/input`, `/telemetry/proxy/…`, `/evp_proxy/…`, …); either half alone would risk dropping a real call, since an app may serve anything on 8126 and a `/v0.4/traces`-shaped path elsewhere is the app's own endpoint. Agentless submission to a `datadoghq.com` intake is not covered, and neither is a call a session made. Record mode only; a replay is unaffected.
- Health probes are recorded as nothing at all — not the inbound request, and not what it fans out to. A GET/HEAD to a conventional probe path (`/health`, `/healthz`, `/healthcheck`, `/health-check`, `/_health`, `/api/health`, `/api/healthz`, `/readyz`, `/livez`, `/ping`) carrying no `x-meticulous-session-id` never enters the capture context. A request that names its session is real app traffic and is recorded whatever its path, so an app is still free to serve `/api/health` as a page's data source. Record mode only; a replay is unaffected.
- A Durable Object stub is recorded without a binding name, since the stub comes from `namespace.get()` rather than being a binding itself.
- A binding reference bound before the first instrumented request (`const f = env.SVC.fetch.bind(env.SVC)` at module scope) escapes instrumentation. Holding the binding _object_ and calling `.fetch()` on it per request — what SDKs normally do — is captured.
- WebSocket upgrades and TCP sockets (`connect()`) are not captured.
- `fetch` calls made outside a request handled by `withMeticulous` (e.g. in `scheduled` handlers) are not captured.
- postgres.js queries are recorded but **not replayed inside workerd**: a recording made in a Worker is served back by the Node recorder's mock store when the app under replay runs on Node. A workerd replay reaches the real database.
