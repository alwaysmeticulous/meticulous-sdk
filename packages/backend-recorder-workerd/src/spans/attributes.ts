/**
 * Span attribute names and technology tags shared by the two recording surfaces.
 *
 * These live here, in the package the in-worker shim ships from, for the same reason
 * `kv-capture.ts` does: a session recorded through workerd and one recorded through the Node
 * recorder have to be attribute-for-attribute identical, or a recording made on one cannot be
 * replayed by the other. `packages/backend-recorder-js/src/constants.ts` re-exports every name
 * below, so the Node recorder keeps one import site and there is one definition.
 */

/** Tags which client library produced a CLIENT span. Absent on native `node:http` spans. */
export const CLIENT_TECHNOLOGY_ATTR = "meticulous.client_technology";

/** Ties a backend span to the frontend session whose request produced it. */
export const FRONTEND_SESSION_ID_ATTR = "meticulous.frontend_session_id";

/**
 * Where the session id on a span came from. Absent means the browser minted it and sent it on
 * the request, which is the normal case. `"backend"` means we minted it ourselves for a document
 * navigation the browser could not tag (see provisional-session-id.ts), and the page may or may
 * not have gone on to adopt it.
 *
 * The distinction is load-bearing for ingestion: an unadopted backend-minted id names a session
 * that will never exist, and must be treated as *unstamped* so those spans stay eligible for
 * time-window attachment — otherwise stamping them makes attribution worse than leaving them
 * bare. See `hasAnySessionId` in lambda-upload-sessions.
 */
export const SESSION_ID_ORIGIN_ATTR = "meticulous.session_id_origin";
export const SESSION_ID_ORIGIN_BACKEND = "backend";

/**
 * An outgoing `fetch` from a Worker. Served back on replay by a `MockStore("workerd-fetch")`
 * living in the replay sidecar, which the in-worker shim queries over plain HTTP (workerd cannot
 * run the Node mock instrumentations).
 *
 * This value travels in recorded session data, so it is a wire contract: the replay orchestrator
 * reads it back as `WORKERD_FETCH_CLIENT_TECHNOLOGY` in `@alwaysmeticulous/api` to decide whether
 * a recording needs a workerd replay sidecar. Keep the two in step.
 */
export const CLIENT_TECHNOLOGY_WORKERD_FETCH = "workerd-fetch";

/**
 * A `fetch` through a Cloudflare binding — a service binding or a Durable Object stub. Recorded
 * from two places: the in-worker shim, and `withMeticulousCloudflareEnv` in a Node process whose
 * bindings come from wrangler's `getPlatformProxy`. Kept distinct from `workerd-fetch` because a
 * binding call never leaves the isolate and its URL is caller-invented, so the two must never be
 * matched against each other.
 */
export const CLIENT_TECHNOLOGY_WORKERD_BINDING = "workerd-binding";

/**
 * An operation on a Cloudflare KV namespace binding, from the same two places. Its own technology
 * because a KV operation is not Request/Response-shaped at all — there is no method, URL or status
 * to match on, only a binding, an operation and a key.
 */
export const CLIENT_TECHNOLOGY_WORKERD_KV = "workerd-kv";

/**
 * A postgres.js query, whether captured in Node (by the require hook or `withMeticulousPostgres`)
 * or in a deployed Worker. Deliberately distinct from `postgres` (node-postgres) so the two stores
 * never match each other's spans even though both talk to Postgres.
 */
export const CLIENT_TECHNOLOGY_POSTGRES_JS = "postgres-js";

/**
 * The `env` key a binding call went through. Absent when the binding instance was never seen on
 * `env` — most commonly a Durable Object stub, which `namespace.get()` returns. Shared by
 * `fetch`-shaped binding spans and KV spans: both identify the binding this way.
 */
export const WORKERD_BINDING_NAME_ATTR = "meticulous.workerd.binding";

/** Which KV method was called: `get`, `getWithMetadata`, `put`, `delete` or `list`. */
export const WORKERD_KV_OPERATION_ATTR = "meticulous.workerd.kv.operation";
/** The key operated on. Absent for `list` and for a bulk `get`, whose keys are in the args. */
export const WORKERD_KV_KEY_ATTR = "meticulous.workerd.kv.key";
/** JSON of the call's arguments; a `put` value appears as null (it lives in the value attr). */
export const WORKERD_KV_ARGS_ATTR = "meticulous.workerd.kv.args";
export const WORKERD_KV_ARGS_TRUNCATED_ATTR =
  "meticulous.workerd.kv.args.truncated";
/** JSON of the value a `put` wrote, with secret-looking fields redacted. */
export const WORKERD_KV_VALUE_ATTR = "meticulous.workerd.kv.value";
export const WORKERD_KV_VALUE_TRUNCATED_ATTR =
  "meticulous.workerd.kv.value.truncated";
/** JSON of what the operation returned. Absent for `put`/`delete`, which return nothing. */
export const WORKERD_KV_RESULT_ATTR = "meticulous.workerd.kv.result";
export const WORKERD_KV_RESULT_TRUNCATED_ATTR =
  "meticulous.workerd.kv.result.truncated";
/**
 * Why a value is missing: `"stream"` (reading it would take the bytes from the app) or `"binary"`
 * (skipped deliberately — KV blobs are large and not UTF-8).
 */
export const WORKERD_KV_OMITTED_ATTR = "meticulous.workerd.kv.omitted";
