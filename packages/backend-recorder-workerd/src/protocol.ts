/**
 * Wire protocol between the in-worker shim and the Meticulous backend
 * recorder sidecar. The sidecar imports these types (type-only), so this file
 * is the single source of truth for the shape of capture events.
 */

import type { BodyEncoding } from "./body-encoding";

export const SIDECAR_PROTOCOL_VERSION = "2";

/** Header carrying {@link SIDECAR_PROTOCOL_VERSION} on every shim → sidecar request. */
export const SIDECAR_PROTOCOL_VERSION_HEADER =
  "x-meticulous-sidecar-protocol-version";

/**
 * Header the Meticulous frontend recorder stamps on requests made by the app
 * under recording; its value ties backend spans to the frontend session.
 */
export const FRONTEND_SESSION_ID_HEADER = "x-meticulous-session-id";

/** Header identifying one replay attempt of a recorded frontend session. */
export const REPLAY_ID_HEADER = "x-meticulous-replay-id";

/**
 * Elapsed virtual time (ms from replay start) of the triggering frontend
 * request. Injected by the replay runner on app-url requests during backend
 * testing; the sidecar uses it to pick the closest recorded burst when several
 * candidates share a loosened match key.
 */
export const VIRTUAL_TIME_HEADER = "x-meticulous-virtual-time";

/**
 * Parses {@link VIRTUAL_TIME_HEADER}. `0` is a valid start-of-session time;
 * anything non-finite or negative is ignored so a garbage header cannot skew matching.
 */
export const parseVirtualTimeMs = (
  value: string | null | undefined,
): number | undefined => {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
};

/**
 * A request carrying this header set to `"true"` is never served from the recording and
 * never fails on a miss — it goes to the real network. Use it for a call that must be live
 * during replay (a health probe, telemetry, a resource the recording cannot cover).
 *
 * Same convention and value as the frontend network stubbing and the Node backend recorder
 * (`METICULOUS_PASSTHROUGH_HEADER` in `@alwaysmeticulous/backend-recorder-js`); the value
 * must stay in step with both.
 */
export const METICULOUS_PASSTHROUGH_HEADER = "meticulous-passthrough";

export const SIDECAR_EVENTS_PATH = "/v1/events";

/**
 * Replay routes. A sidecar started in record mode answers 404 on both. Replay is hermetic,
 * so an unanswered outbound-fetch lookup fails the app's call rather than letting it reach
 * the real service — the same as any other failure to stub.
 */
export const SIDECAR_REPLAY_SESSION_PATH = "/v1/replay/session";
export const SIDECAR_REPLAY_OUTBOUND_FETCH_PATH = "/v1/replay/outbound-fetch";

/**
 * Line-coverage reporting. Additive: an older sidecar answers 404, which the
 * shim treats as "coverage not collected here" and stops reporting for the life
 * of the isolate. Deliberately NOT guarded by a
 * {@link SIDECAR_PROTOCOL_VERSION} bump — that check is exact equality, so a
 * bump would stop every already-built customer image from mocking at all.
 */
export const SIDECAR_REPLAY_COVERAGE_PATH = "/v1/replay/coverage";

/**
 * Header carrying the replay sidecar's origin, injected by the Meticulous replay runner
 * on requests to the app under test. Workerd cannot see container environment variables,
 * so an inbound header is the only way per-replay config can reach the shim.
 *
 * The shim validates the value before using it and only honours a loopback /
 * `host.docker.internal` / private-network `http:` origin — see `sidecar-url.ts`.
 */
export const REPLAY_SIDECAR_URL_HEADER =
  "x-meticulous-backend-replay-sidecar-url";

/**
 * Header the in-worker shim stamps on every app response (record and replay)
 * carrying the shim's npm package version. The replay runner reads this from
 * Puppeteer — workerd cannot see container env, and the execute pod cannot
 * reach the in-pod sidecar, so a response header is the only channel that
 * reports which bundled shim produced a replay's After screenshots.
 */
export const WORKERD_SHIM_VERSION_HEADER = "x-meticulous-workerd-shim-version";

/**
 * The only headers persisted on capture events. Everything else — notably
 * authorization, cookie/set-cookie, and API-key headers — is dropped at
 * capture time, before it ever leaves the worker.
 *
 * The Node backend recorder persists the same two, plus the inbound request's
 * `Cookie` header on SERVER spans (`recorded-request-headers.ts`). This list
 * has not followed it there, so a workerd recording of an authenticated server
 * render still carries no session cookie.
 */
export const CAPTURED_HEADERS = [
  "content-type",
  FRONTEND_SESSION_ID_HEADER,
] as const;

export interface CapturedBody {
  /**
   * The body truncated to the capture cap: its UTF-8 text, or base64 of its bytes when
   * `encoding` is set.
   */
  body: string;
  /** True when the body exceeded the capture cap or the read was cut short. */
  truncated: boolean;
  /**
   * Set only on a response body whose bytes are not UTF-8, which is stored base64 so that replay
   * can serve it back exactly. Additive and non-version-bumping: an older shim omits it, and its
   * bodies are text as before.
   */
  encoding?: BodyEncoding;
}

/**
 * The fields every capture event carries to say which request, session and trace it belongs to.
 */
interface CorrelatedEvent {
  /** Correlates outbound events to the inbound request being handled. */
  requestId: string;
  /** Value of {@link FRONTEND_SESSION_ID_HEADER} on the inbound request, if any. */
  frontendSessionId?: string;
  /**
   * Trace the request's spans belong to (32 hex chars), minted by the shim.
   *
   * The shim mints it, rather than the sidecar deriving it from {@link requestId}, so span
   * assembly is stateless: a sidecar that had to remember `requestId → traceId` would give a
   * request's SERVER span and its CLIENT children different traces whenever it lost that memory
   * between two batches — which, for a Worker-hosted sidecar, an eviction can do at any moment.
   *
   * Optional so a sidecar keeps working against a shim that predates this field, in which case
   * it falls back to its own per-`requestId` map.
   */
  traceId?: string;
  /**
   * Span id of the request's SERVER span (16 hex chars), also minted by the shim: it is the
   * parent of every CLIENT span the request produced, and the inbound event's own span id.
   */
  serverSpanId?: string;
}

interface BaseRequestEvent extends CorrelatedEvent {
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
  /**
   * Where {@link BaseRequestEvent.frontendSessionId} came from. Absent means the browser
   * minted it and sent it on the request, which is the normal case. `"backend"` means the
   * shim minted it for a document navigation the browser could not tag, and the page may or
   * may not have gone on to adopt it — a distinction ingestion needs, because an unadopted
   * backend-minted id names a session that will never exist and must be treated as unstamped.
   * The sidecar turns it into `meticulous.session_id_origin`.
   *
   * Optional, and therefore compatible with an older sidecar (which ignores it) — which is
   * why adding it does not bump {@link SIDECAR_PROTOCOL_VERSION}, a strict-equality check
   * whose bump would instead make this shim unusable against one.
   */
  sessionIdOrigin?: "backend";
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
export interface KvOperationEvent extends CorrelatedEvent {
  kind: "kv";
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

/**
 * One postgres.js query made while handling an inbound request (becomes a CLIENT span).
 *
 * Deliberately carries the same fields the Node recorder puts on a postgres.js span rather than
 * anything Worker-specific: `PostgresJsMockStore` builds its match key from those attributes at
 * load time, so a query recorded here replays through the existing Node mock path unchanged.
 * See `postgres/capture.ts` for the serialization, which both surfaces share.
 */
export interface PostgresQueryEvent extends CorrelatedEvent {
  kind: "postgres";
  /** SQL rebuilt from the tagged template's chunks, with `$1`, `$2`… placeholders. */
  queryText: string;
  /** JSON of the interpolated values, from `serializePostgresJsArgs`. */
  params: string;
  /** `""`, `"raw"` or `"values"` — the row shape the query asked for. */
  rowMode: string;
  /** JSON of the resolved `Result`, capped at {@link MAX_POSTGRES_JS_RESULT_SIZE}. */
  result?: CapturedBody;
  /**
   * JSON of the rejection, from `serializePostgresJsError`. Set instead of {@link result}, and
   * distinct from the transport-level `error` string on the HTTP-shaped events: this one is a
   * recorded outcome the replay reproduces, not a note that capture failed.
   */
  errorJson?: string;
  startTimeMs: number;
  endTimeMs: number;
}

export type CaptureEvent =
  | InboundRequestEvent
  | OutboundRequestEvent
  | BindingRequestEvent
  | KvOperationEvent
  | PostgresQueryEvent;

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

/**
 * One request's line coverage, sent to {@link SIDECAR_REPLAY_COVERAGE_PATH}
 * after the response has been produced.
 *
 * `files` carries the build-time id→line map and is sent only on the first
 * report of an isolate: it is the same for every request the isolate serves and
 * is far larger than the hits themselves.
 */
export interface CoverageReportRequest {
  frontendSessionId: string;
  /** Global line ids marked during this request, ascending. */
  hitIds: number[];
  /** Present on an isolate's first report only. */
  files?: Array<{
    path: string;
    firstId: number;
    /** Inclusive 1-based line ranges, flattened as `[s1, e1, s2, e2, ...]`. */
    lineRanges: number[];
  }>;
}

/** Lookup for a single outbound `fetch`, sent to {@link SIDECAR_REPLAY_OUTBOUND_FETCH_PATH}. */
export interface OutboundFetchLookupRequest {
  frontendSessionId: string;
  replayId: string;
  method: string;
  /** Full URL including query string. */
  url: string;
  /**
   * Request body as captured by `readBodyWithCap`. The sidecar hashes this itself, so the
   * hash it compares against a recording is derived from byte-identical input on both the
   * record and replay sides.
   */
  requestBody?: CapturedBody;
  /**
   * Elapsed virtual time (ms from replay start) of the inbound request that
   * dispatched this outbound call, forwarded from {@link VIRTUAL_TIME_HEADER}.
   * The sidecar clusters candidates by recorded timestamp against this value.
   *
   * Additive and non-version-bumping: an older shim omits it, and matching
   * then hashes across every candidate at the matched key.
   */
  virtualTimeMs?: number;
}

/**
 * A recorded response to serve, or a signal the caller must fail the request. Replay is
 * hermetic, so the shim never turns any of these into a real call — nor an outcome it does
 * not recognise. The only live path is the request-side `meticulous-passthrough` header,
 * handled before the lookup, not any response here.
 */
export type OutboundFetchLookupResponse =
  | {
      outcome: "mock";
      statusCode: number;
      body: string;
      /**
       * Set when `body` is base64 of a recorded response that was not UTF-8, so the shim must
       * serve the decoded bytes rather than the text. An older shim ignores it.
       */
      bodyEncoding?: BodyEncoding;
      headers: Record<string, string>;
    }
  /**
   * The store holds nothing for this call — a genuine miss, or a call the sidecar could not
   * look up at all (an unparseable URL). Replay is hermetic, so the shim fails the request
   * rather than letting it reach the real service — matching the Node backend recorder's
   * http/undici mocks. There is deliberately no "let the call through" outcome: the only
   * live path is the request-side `meticulous-passthrough` header.
   */
  | { outcome: "no-mock" };

/**
 * Env var holding the origin of the agent-swarm-testing interceptor service, as a wrangler
 * var on the deployment. Validated exactly like the replay sidecar URL — a loopback /
 * docker-gateway / private-network `http:` origin only — see `sidecar-url.ts`.
 */
export const AGENT_SWARM_TESTING_SIDECAR_URL_ENV_KEY =
  "METICULOUS_AGENT_SWARM_TESTING_SIDECAR_URL";

/**
 * Env var identifying the agent-swarm run, so an interceptor shared by several runs can tell
 * whose traffic a call belongs to.
 */
export const AGENT_SWARM_TESTING_RUN_ID_ENV_KEY =
  "METICULOUS_AGENT_SWARM_TESTING_RUN_ID";

/** Agent-swarm-testing route. */
export const SIDECAR_AGENT_SWARM_TESTING_OUTBOUND_FETCH_PATH =
  "/v1/agent-swarm-testing/outbound-fetch";

/**
 * Agent-swarm-testing route that installs a be-mock: an agent-authored
 * `be-mock.ts` (backend mocks), compiled by the agentic session-generation
 * worker into a self-contained sandbox bundle and sent here as text. The
 * sidecar runs it in its own permission-restricted child process over the
 * frozen RPC toolkit, and routes every intercepted outbound fetch through
 * the module's `interceptRequest` export — see
 * `packages/backend-recorder-js/src/sidecar/be-mock` and
 * `packages/agentic-session-generation-worker/src/app-access/be-mocking`.
 */
export const SIDECAR_AGENT_SWARM_TESTING_BE_MOCK_PATH =
  "/v1/agent-swarm-testing/be-mock";

/**
 * One be-mock install, sent to {@link SIDECAR_AGENT_SWARM_TESTING_BE_MOCK_PATH}.
 * The `code` is the compiled bundle (the per-kind child runner + the frozen
 * RPC + the agent-authored be-mock.ts), not the raw TypeScript: the sidecar
 * image carries no compiler, and the worker's static check has already
 * accepted the source.
 */
export interface BeMockInstallRequest {
  /** Whose run this module belongs to; see {@link AGENT_SWARM_TESTING_RUN_ID_ENV_KEY}. */
  runId: string;
  /** The compiled, self-contained sandbox bundle to install. */
  code: string;
}

/**
 * Agent-swarm-testing route that reads the active be-mock's logs: the worker
 * fetches them when it assembles a test run's result, so the module's
 * `log(...)` lines — startup and `interceptRequest` debug lines alike —
 * reach the agent's run logs instead of dying in the sidecar's pod logs.
 */
export const SIDECAR_AGENT_SWARM_TESTING_BE_MOCK_LOGS_PATH =
  "/v1/agent-swarm-testing/be-mock/logs";

/** One be-mock logs fetch, sent to {@link SIDECAR_AGENT_SWARM_TESTING_BE_MOCK_LOGS_PATH}. */
export interface BeMockLogsRequest {
  /** Whose run's module is being read; see {@link AGENT_SWARM_TESTING_RUN_ID_ENV_KEY}. */
  runId: string;
}

/** The active sandbox's collected logs since its install (this attempt's window). */
export interface BeMockLogsResponse {
  logs: string[];
}

/** The install's outcome, mirroring the run the worker reports. */
export type BeMockInstallResponse =
  | {
      ok: true;
      /** The sandbox's startup logs (stdout/stderr, agent log lines), if any. */
      logs?: string[];
    }
  | {
      ok: false;
      /** Startup failure: the static check, the build or the sandbox rejected it. */
      error: string;
      /** The sandbox's collected logs, for the agent's repair loop. */
      logs: string[];
    };

/**
 * One outbound `fetch` offered to the interceptor, sent to
 * {@link SIDECAR_AGENT_SWARM_TESTING_OUTBOUND_FETCH_PATH}. Unlike replay's lookup there is no
 * consume-once mock state, so a single run id suffices.
 */
export interface OutboundFetchAgentSwarmTestingRequest {
  runId: string;
  /** Value of {@link FRONTEND_SESSION_ID_HEADER} on the inbound request, if any. */
  frontendSessionId?: string;
  method: string;
  /** Full URL including query string. */
  url: string;
  /** Request body as captured by `readBodyWithCap`, mirroring the replay lookup. */
  requestBody?: CapturedBody;
}

/**
 * A response for the interceptor to serve, or a signal to let the call through. Unlike
 * replay's lookup response there is no failure outcome: agent-swarm testing is best-effort,
 * so anything the shim cannot act on becomes a passthrough, never a failed call.
 */
export type OutboundFetchAgentSwarmTestingResponse =
  | {
      outcome: "mock";
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    }
  | { outcome: "passthrough" };
