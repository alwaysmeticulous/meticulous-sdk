import { requestCaptureContext } from "./context";
import {
  type MeticulousExecutionContext,
  runWithMeticulous,
  type WithMeticulousOptions,
} from "./with-meticulous";

export type {
  BindingRequestEvent,
  CaptureEvent,
  CapturedBody,
  CaptureEventsPayload,
  CoverageReportRequest,
  InboundRequestEvent,
  KvOmittedReason,
  KvOperation,
  KvOperationEvent,
  OutboundFetchLookupRequest,
  OutboundFetchLookupResponse,
  OutboundRequestEvent,
  PostgresQueryEvent,
  ReplaySessionInfoResponse,
} from "./protocol";
export {
  CAPTURED_HEADERS,
  FRONTEND_SESSION_ID_HEADER,
  METICULOUS_PASSTHROUGH_HEADER,
  REPLAY_ID_HEADER,
  REPLAY_SIDECAR_URL_HEADER,
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
  SIDECAR_REPLAY_COVERAGE_PATH,
  SIDECAR_REPLAY_OUTBOUND_FETCH_PATH,
  SIDECAR_REPLAY_SESSION_PATH,
  WORKERD_SHIM_VERSION_HEADER,
} from "./protocol";
export { WORKERD_SHIM_VERSION } from "./version";
export {
  MAX_BODY_CAPTURE_SIZE,
  readBodyWithCap,
  readRequestBodyWithCap,
} from "./body-capture";
export { headersToRecord } from "./outbound-capture";
export { redactRequestBody, STR_REDACTED } from "./redact-body";
export type { CoverageMap, CoverageMapFile } from "./coverage/coverage.types";
// __mcEnter / __mcHit are the entry points the Vite plugin's injected imports
// bind to, so they are part of the package's public surface even though no
// human writes a call to them.
export {
  __mcEnter,
  __mcHit,
  collectHitIds,
  createCoverageSink,
  getCoverageMap,
  getUnreportedCoverageFiles,
  markCoverageFilesReported,
  registerCoverageFile,
} from "./coverage/runtime";
export type { MeticulousExecutionContext, WithMeticulousOptions };
export {
  type MeticulousPagesFunction,
  type MeticulousPagesFunctionContext,
  withMeticulousPagesFunction,
} from "./pages-function";
export {
  SIDECAR_BINDING_ENV_KEY,
  SIDECAR_BINDING_ORIGIN,
  SIDECAR_URL_ENV_KEY,
  type SidecarFetcher,
  type SidecarTransport,
} from "./sidecar-transport";
/**
 * Exported for the Node recorder's `withMeticulousCloudflareEnv`, which records the same KV
 * operations from a process whose bindings come from wrangler's `getPlatformProxy`. Both surfaces
 * must produce identical fields, so the contract has exactly one implementation.
 */
export {
  type KvCaptureFields,
  type KvCaptureOutcome,
  serializeKvArgs,
  serializeKvCaptureFields,
} from "./kv-capture";
/**
 * Exported for the same reason: the Node recorder re-exports these so a postgres.js query, a
 * captured error and a built span are byte-identical whichever surface produced them. A
 * Worker-hosted sidecar needs them too, and cannot load the Node bundle.
 */
export {
  deserializeCapturedError,
  serializeCapturedError,
} from "./error-capture";
export {
  isSupportedPostgresJsQuery,
  MAX_POSTGRES_JS_RESULT_SIZE,
  POSTGRES_JS_ERROR_ATTR,
  POSTGRES_JS_QUERY_PARAMS_ATTR,
  POSTGRES_JS_QUERY_TEXT_ATTR,
  POSTGRES_JS_RESULT_ATTR,
  POSTGRES_JS_RESULT_TRUNCATED_ATTR,
  POSTGRES_JS_ROW_MODE_ATTR,
  postgresJsCommandOf,
  type PostgresJsQueryLike,
  type PostgresJsRowMode,
  reconstructQueryText,
  resolveRowMode,
  serializePostgresJsArgs,
  serializePostgresJsError,
  serializePostgresJsResult,
} from "./postgres/capture";
export { withMeticulousPostgres } from "./postgres/with-meticulous-postgres";
export * from "./spans/attributes";
export {
  hrTimeToMs,
  msToHrTime,
  type HrTime,
  type ReadableSpan,
  type SerializedSpanBase,
  SPAN_KIND_CLIENT,
  SPAN_KIND_INTERNAL,
  SPAN_KIND_SERVER,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  SPAN_STATUS_UNSET,
  type SpanStatus,
} from "./spans/readable-span";
export { serializeSpan } from "./spans/serialize-span";
export { randomHex, SpanBuilder } from "./spans/span-builder";
export { redactUrlCredentials } from "./spans/url-redaction";
/**
 * Exported for the Node recorder, whose own `provisional-session-id.ts` adapts these to
 * `http.IncomingMessage` / `http.ServerResponse`. The mint format, the rule for which requests
 * get an id and the `Server-Timing` metric are all wire contracts with the page, so — as with
 * the KV capture fields above — they have exactly one implementation.
 */
export {
  type HeaderReader,
  SERVER_TIMING_HEADER,
  SERVER_TIMING_SESSION_METRIC,
  buildServerTimingSessionEntry,
  isProvisionalSessionIdCandidate,
  mintProvisionalSessionId,
} from "./provisional-session-id";

/** Structural subset of an ES-module Worker handler (`export default {...}`). */
export interface MeticulousWorkerHandler<Env = never> {
  fetch(
    request: Request,
    env: Env,
    ctx: MeticulousExecutionContext,
  ): Response | Promise<Response>;
}

/**
 * Wraps an ES-module Worker handler so Meticulous can record, or replay, the app's HTTP
 * behaviour:
 *
 *   export default withMeticulous({
 *     async fetch(request, env, ctx) { ... },
 *   });
 *
 * For a Cloudflare Pages project, whose worker exports `onRequest` instead, use
 * {@link withMeticulousPagesFunction} — same behaviour, different handler shape.
 *
 * **Recording** activates on either a `METICULOUS_SIDECAR` service binding (how a **deployed**
 * Worker records: the binding points at a Meticulous recorder sidecar Worker in the same account)
 * or a `METICULOUS_SIDECAR_URL` var (how `wrangler dev` records against a local sidecar process),
 * or the matching `options`. Inbound requests, outgoing `fetch` calls, calls through
 * `fetch`-shaped bindings, KV namespace operations and — with `withMeticulousPostgres` — postgres.js
 * queries are reported to the sidecar, batched into one report per request, without affecting the
 * app. A binding beats a var if both are configured: only the binding can have been added to
 * *this* deployment's wrangler configuration deliberately, whereas a stale `.dev.vars` travels
 * with an image.
 *
 * **Replay** activates on the `x-meticulous-backend-replay-sidecar-url` header, injected by the
 * Meticulous replay runner on requests to the app under test. Outgoing `fetch` calls are then
 * served from the recording instead of reaching the real service — and a call the recording does
 * not cover fails, rather than quietly becoming live traffic; put a `meticulous-passthrough: true`
 * header on a request that must stay real. The clock is frozen at the recorded session's end so
 * recorded credentials are still valid, and `Math.random` / `crypto.randomUUID` /
 * `crypto.getRandomValues` are seeded so ids the app mints are the same in every replay of that
 * session. Workerd cannot read container environment variables, which is why per-replay config
 * arrives as a request header; the shim validates it and only honours a loopback /
 * docker-gateway / private-network `http:` origin.
 *
 * Replay takes precedence over recording when both are configured. A stale sidecar var baked into
 * an image is far more likely than a spurious replay header (nothing but the replay runner emits
 * one), and letting the env win would silently record a replay instead of mocking it.
 *
 * With neither configured the wrapper is a complete pass-through, so it is safe to keep in
 * deployed code. Requires the `nodejs_als` (or `nodejs_compat`) compatibility flag. A capture
 * failure or unreachable sidecar never affects the app.
 */
export const withMeticulous = <H extends MeticulousWorkerHandler<never>>(
  handler: H,
  options?: WithMeticulousOptions,
): H => {
  const wrappedFetch = (
    request: Request,
    env: unknown,
    ctx: MeticulousExecutionContext,
  ): Promise<Response> =>
    runWithMeticulous(
      {
        request,
        env,
        ctx,
        invokeHandler: () => handler.fetch(request, env as never, ctx),
      },
      options,
    );

  // The wrapper only replaces `fetch` (same call signature), but TypeScript cannot verify a
  // spread against the bare generic H.
  return { ...handler, fetch: wrappedFetch } as H;
};

/**
 * The Meticulous session id of the request currently being served, or `undefined` if this
 * call cannot be tied to one — including whenever the wrapper is a pass-through.
 *
 * Exposed so a server-rendering worker can put the id into the HTML it is about to return,
 * typically as `data-session-id` on the recorder's own `<script>` tag. That is the exact,
 * cache-proof alternative to the `Server-Timing` header the shim publishes automatically;
 * doing both is fine, since the recorder prefers the rendered value. It is also how the id
 * reaches another process — a document navigation has no inbound header for the app to
 * forward, so a worker that fans out to its own services has to pass this on as
 * `x-meticulous-session-id` itself.
 *
 * During a replay this returns the replayed session's id, which is the same value the render
 * being replayed was given when it was recorded (the page adopted the minted id, so that is
 * what the recording is stored under, and it is what the replay runner injects back). An app
 * that renders the id therefore renders the same bytes both times, rather than the id turning
 * every server-rendered page into a diff.
 */
export const getMeticulousSessionId = (): string | undefined =>
  requestCaptureContext.getStore()?.frontendSessionId;
