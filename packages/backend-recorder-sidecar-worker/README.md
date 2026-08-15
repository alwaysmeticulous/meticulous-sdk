# Meticulous Backend Recorder Sidecar for Cloudflare Workers

The Meticulous backend recorder sidecar, packaged as a Cloudflare Worker you deploy into **your own** Cloudflare account. It is what makes backend recording possible from a **deployed** Worker or Pages project — `wrangler deploy`, `wrangler pages deploy`, or a preview deployment — where there is no local sidecar process for the in-worker shim to post to.

Your app's Worker reaches it through a service binding, so reports never leave your Cloudflare account until the sidecar uploads a finished session chunk to Meticulous.

For local development (`wrangler dev`) you do not need this: run `npx @alwaysmeticulous/cli record backend` and point the shim at that instead.

## How it fits together

```
your app's Worker / Pages Function
  withMeticulous(...) or withMeticulousPagesFunction(...)
    └─ batches the request's capture events, one report per request
         env.METICULOUS_SIDECAR.fetch(...)          ← service binding, same colo
                    │
  meticulous-recorder-sidecar (this package, your account)
    ├─ fetch: validate, hand off, answer 204        ← thin: the app's waitUntil is waiting
    └─ MeticulousRecorderSession (Durable Object)
         ├─ persist the batch, arm a 5s alarm
         └─ alarm: build spans → upload a chunk to Meticulous
```

Everything expensive happens on the alarm, after your app's response has gone out.

## Setup

1. Create a directory for the sidecar (anywhere — its own repo, or a folder in yours) and install this package:

   ```bash
   npm install @alwaysmeticulous/backend-recorder-sidecar-worker
   ```

2. `src/index.ts` — the whole Worker:

   ```ts
   export {
     default,
     MeticulousRecorderSession,
   } from "@alwaysmeticulous/backend-recorder-sidecar-worker";
   ```

3. `wrangler.toml` — copy `node_modules/@alwaysmeticulous/backend-recorder-sidecar-worker/wrangler.template.toml` and set `METICULOUS_RECORDING_TOKEN` to your project's recording token. That is the same public value your frontend recorder snippet already carries in `data-recording-token`; it is not a secret.

4. Deploy:

   ```bash
   npx wrangler deploy
   ```

5. Bind it from your app, in **every** environment you want recorded:

   ```toml
   [[services]]
   binding = "METICULOUS_SIDECAR"
   service = "meticulous-recorder-sidecar"
   ```

6. Wrap your app's handler with `@alwaysmeticulous/backend-recorder-workerd` — `withMeticulous` for an ES-module Worker, `withMeticulousPagesFunction` for a Pages project. It activates on the binding automatically; nothing else is needed.

Verify with `npx wrangler tail meticulous-recorder-sidecar` while using your app: you should see `Accepted N event(s)` followed by `Wrote chunk 1 of BE_…`.

## Configuration

| Var                          | Required | Meaning                                                       |
| ---------------------------- | -------- | ------------------------------------------------------------- |
| `METICULOUS_RECORDING_TOKEN` | yes      | The project to record into.                                   |
| `METICULOUS_PROJECT_NAME`    | no       | Shown on the recorded session. Defaults to `unknown_service`. |
| `METICULOUS_SIDECAR_SHARDS`  | no       | Durable Objects to spread reports across. Defaults to `1`.    |
| `METICULOUS_LOG_LEVEL`       | no       | `trace`…`silent`. Defaults to `info`.                         |

A single Durable Object has a soft limit of about a thousand requests per second, and one report covers a whole request, so `1` is right well past the point where most staging deployments sit. Raising it is free: nothing downstream depends on which object a span passed through — Meticulous correlates backend spans to frontend sessions by an attribute on the span itself.

## Routes

All three are reached through the service binding.

- `POST /v1/events` — what the shim reports to.
- `GET /v1/health` — `{ok: true, configured: boolean}`. `configured` is false when the recording token is unset, which is otherwise a silent misconfiguration.
- `POST /v1/flush` — upload whatever is buffered now, instead of waiting out the 5s alarm. Worth calling at the end of a CI run that recorded against a preview deployment, so the recording reaches Meticulous before the job exits.

## Security

**This Worker must not have a public route.** The capture protocol carries no authentication — it was designed for a sidecar on loopback — so a `workers.dev` subdomain would be an open endpoint that writes spans into your Meticulous project. The shipped wrangler config sets `workers_dev = false`; keep it that way, and do not add a route.

Uploads go to Meticulous' recorder-payloads bucket using unauthenticated Cognito credentials — the same bucket and the same identity pool the Meticulous browser recorder already uploads to from your users' browsers. No AWS credentials are involved and none are stored here.

What is captured, and what is redacted before it leaves your app, is decided by the shim rather than by this Worker: request bodies have secret-looking JSON fields replaced, and only `content-type` and the Meticulous session header are persisted. See the `@alwaysmeticulous/backend-recorder-workerd` README.

## Limitations

- **Recording only.** Replaying a session against your app is served by a separate Meticulous replay sidecar during a test run; this Worker has no mock store and no replay routes.
- **A deployed sidecar is versioned by you.** It writes the span format Meticulous' replay stores read, so keep it roughly in step with `@alwaysmeticulous/backend-recorder-workerd` rather than leaving one of the two years behind.
- **A session spans at most 30 chunks or 10 minutes** before rolling over to a fresh one, matching the local sidecar. Frontend sessions are correlated across that boundary, so a rollover is not visible in the product.
- **Three consecutive upload failures abandon the session** and leave an `abandoned.json` marker, so a truncated recording is never read as a complete one. Recording resumes under a fresh session five minutes later; the requests in between are not recorded.
