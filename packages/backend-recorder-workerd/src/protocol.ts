/**
 * Wire protocol between the in-worker shim and the Meticulous backend
 * recorder sidecar. The sidecar imports these types (type-only), so this file
 * is the single source of truth for the shape of capture events.
 */

export const SIDECAR_PROTOCOL_VERSION = "1";

/** Header carrying {@link SIDECAR_PROTOCOL_VERSION} on every shim → sidecar request. */
export const SIDECAR_PROTOCOL_VERSION_HEADER =
  "x-meticulous-sidecar-protocol-version";

/**
 * Header the Meticulous frontend recorder stamps on requests made by the app
 * under recording; its value ties backend spans to the frontend session.
 */
export const FRONTEND_SESSION_ID_HEADER = "x-meticulous-session-id";

export const SIDECAR_EVENTS_PATH = "/v1/events";

/**
 * Replay routes. A sidecar started in record mode answers 404 on both, which the shim
 * treats as "replay unavailable" and falls back to plain pass-through — so a new shim
 * keeps working against an older, record-only sidecar.
 */
export const SIDECAR_REPLAY_SESSION_PATH = "/v1/replay/session";
export const SIDECAR_REPLAY_OUTBOUND_FETCH_PATH = "/v1/replay/outbound-fetch";

/**
 * Header carrying the replay sidecar's origin, injected by the Meticulous replay runner
 * on requests to the app under test. Workerd cannot see container environment variables,
 * so an inbound header is the only way per-replay config can reach the shim.
 *
 * The shim validates the value before using it and only honours a loopback /
 * `host.docker.internal` / private-network `http:` origin — see `replay-sidecar-url.ts`.
 */
export const REPLAY_SIDECAR_URL_HEADER =
  "x-meticulous-backend-replay-sidecar-url";

/**
 * The only headers persisted on capture events. Everything else — notably
 * authorization, cookie/set-cookie, and API-key headers — is dropped at
 * capture time, before it ever leaves the worker. Mirrors the Node backend
 * recorder, which persists only content-type plus the Meticulous session
 * header.
 */
export const CAPTURED_HEADERS = [
  "content-type",
  FRONTEND_SESSION_ID_HEADER,
] as const;

export interface CapturedBody {
  /** UTF-8 decoded body, truncated to the capture cap. */
  body: string;
  /** True when the body exceeded the capture cap or the read was cut short. */
  truncated: boolean;
}

interface BaseRequestEvent {
  /** Correlates outbound events to the inbound request being handled. */
  requestId: string;
  /** Value of {@link FRONTEND_SESSION_ID_HEADER} on the inbound request, if any. */
  frontendSessionId?: string;
  method: string;
  /** Full URL including query string. */
  url: string;
  /** Lower-cased header name → values. */
  requestHeaders: Record<string, string[]>;
  responseHeaders?: Record<string, string[]>;
  statusCode?: number;
  startTimeMs: number;
  endTimeMs: number;
  /** Set when the request failed before a response was produced. */
  error?: string;
}

/**
 * The worker's own inbound request (becomes a SERVER span). Bodies are not
 * captured, matching the Node backend recorder's SERVER-span contract.
 */
export interface InboundRequestEvent extends BaseRequestEvent {
  kind: "inbound";
}

/**
 * An outgoing `fetch` call made while handling an inbound request (becomes a
 * CLIENT span).
 */
export interface OutboundRequestEvent extends BaseRequestEvent {
  kind: "outbound";
  requestBody?: CapturedBody;
  responseBody?: CapturedBody;
}

/**
 * A `fetch` through a Cloudflare binding — a service binding, an assets binding, or a
 * Durable Object stub — made while handling an inbound request (becomes a CLIENT span).
 *
 * Request/Response-shaped like {@link OutboundRequestEvent}, but a distinct kind because the
 * call never leaves the isolate and its URL is whatever the caller invented. Keeping the two
 * apart means a binding call and real egress can never be confused for one another when
 * these spans are eventually mocked.
 */
export interface BindingRequestEvent extends BaseRequestEvent {
  kind: "binding";
  /**
   * The `env` key the binding was found under. Absent when the instance was never seen on
   * `env` — most commonly a Durable Object stub, which `namespace.get()` produces rather
   * than being a binding in its own right.
   */
  bindingName?: string;
  requestBody?: CapturedBody;
  responseBody?: CapturedBody;
}

/** KV namespace methods the shim records. */
export type KvOperation = "get" | "getWithMetadata" | "put" | "delete" | "list";

/**
 * Why a KV value is absent from an event: workerd handed it over in a form that cannot be
 * persisted as text. A `"stream"` value must not even be read — consuming it would take the
 * bytes away from the app — and binary values are skipped deliberately, since KV blobs are
 * large and would both bloat the recording and be mangled by UTF-8 capture.
 */
export type KvOmittedReason = "binary" | "stream";

/**
 * An operation on a Cloudflare KV namespace binding, made while handling an inbound request
 * (becomes a CLIENT span).
 *
 * KV is not HTTP: there is no method, URL or status code, so this event shares nothing with
 * {@link BaseRequestEvent} beyond correlation and timing. Values are JSON so that a single
 * `JSON.parse` reconstructs exactly what the app saw, whichever `type` the read asked for.
 */
export interface KvOperationEvent {
  kind: "kv";
  /** Correlates the operation to the inbound request being handled. */
  requestId: string;
  frontendSessionId?: string;
  /**
   * The `env` key the KV namespace was found under. Always present, unlike on a binding
   * event: a namespace has no factory equivalent to `DurableObjectNamespace.get()`, so one
   * that was never seen on `env` is not recorded at all.
   */
  bindingName: string;
  operation: KvOperation;
  /**
   * The key operated on, when it is a single string. Absent for `list` (which spans keys) and
   * for a bulk `get` (which takes an array) — both keep their arguments in {@link args}.
   */
  key?: string;
  /**
   * JSON of the call's arguments: the read `type`, the `put` options, the `list` selector.
   * A `put` value appears as `null` here — it is captured in {@link value} instead, so that
   * redaction applies to it.
   */
  args?: CapturedBody;
  /** JSON of the value a `put` wrote, with secret-looking fields redacted. */
  value?: CapturedBody;
  /**
   * JSON of what the operation returned: the value for `get`, `{value, metadata}` for
   * `getWithMetadata`, the key page for `list`. Absent for `put`/`delete`, which return
   * nothing, and for a value that could not be captured (see {@link omitted}).
   */
  result?: CapturedBody;
  /**
   * Why the operation's value is missing. Refers to the written value for `put` and to the
   * read value otherwise — a `put` has no result, so this is never ambiguous.
   */
  omitted?: KvOmittedReason;
  startTimeMs: number;
  endTimeMs: number;
  /** Set when the operation threw. */
  error?: string;
}

export type CaptureEvent =
  | InboundRequestEvent
  | OutboundRequestEvent
  | BindingRequestEvent
  | KvOperationEvent;

export interface CaptureEventsPayload {
  events: CaptureEvent[];
}

/**
 * Answer to `GET {SIDECAR_REPLAY_SESSION_PATH}?sessionId=<id>`: whether the sidecar holds
 * mocks for a session, and the virtual clock anchor to freeze `Date` at while serving it.
 */
export interface ReplaySessionInfoResponse {
  found: boolean;
  /**
   * Epoch ms of the session's last recorded activity. The worker freezes its clock here so
   * that credentials minted during the recording are already issued but not yet expired.
   */
  clockAnchorMs?: number;
}

/** Lookup for a single outbound `fetch`, sent to {@link SIDECAR_REPLAY_OUTBOUND_FETCH_PATH}. */
export interface OutboundFetchLookupRequest {
  frontendSessionId: string;
  method: string;
  /** Full URL including query string. */
  url: string;
  /**
   * Request body as captured by `readBodyWithCap`. The sidecar hashes this itself, so the
   * hash it compares against a recording is derived from byte-identical input on both the
   * record and replay sides.
   */
  requestBody?: CapturedBody;
}

/**
 * Either a recorded response to serve, or an instruction to let the real call through.
 * An unrecognised `outcome` must be treated as `passthrough`, so an older shim keeps
 * working against a newer sidecar.
 */
export type OutboundFetchLookupResponse =
  | {
      outcome: "mock";
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    }
  | { outcome: "passthrough" };
