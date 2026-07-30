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

export type CaptureEvent = InboundRequestEvent | OutboundRequestEvent;

export interface CaptureEventsPayload {
  events: CaptureEvent[];
}
