import {
  type BindingRequestEvent,
  CAPTURED_HEADERS,
  type CaptureEvent,
  type InboundRequestEvent,
  type KvOperationEvent,
  type OutboundRequestEvent,
  type PostgresQueryEvent,
} from "../protocol";
import {
  MAX_POSTGRES_JS_RESULT_SIZE,
  POSTGRES_JS_ERROR_ATTR,
  POSTGRES_JS_QUERY_PARAMS_ATTR,
  POSTGRES_JS_QUERY_TEXT_ATTR,
  POSTGRES_JS_RESULT_ATTR,
  POSTGRES_JS_RESULT_TRUNCATED_ATTR,
  POSTGRES_JS_ROW_MODE_ATTR,
  postgresJsCommandOf,
} from "../postgres/capture";
import {
  CLIENT_TECHNOLOGY_ATTR,
  CLIENT_TECHNOLOGY_POSTGRES_JS,
  CLIENT_TECHNOLOGY_WORKERD_BINDING,
  CLIENT_TECHNOLOGY_WORKERD_FETCH,
  CLIENT_TECHNOLOGY_WORKERD_KV,
  FRONTEND_SESSION_ID_ATTR,
  SESSION_ID_ORIGIN_ATTR,
  WORKERD_BINDING_NAME_ATTR,
  WORKERD_KV_ARGS_ATTR,
  WORKERD_KV_ARGS_TRUNCATED_ATTR,
  WORKERD_KV_KEY_ATTR,
  WORKERD_KV_OMITTED_ATTR,
  WORKERD_KV_OPERATION_ATTR,
  WORKERD_KV_RESULT_ATTR,
  WORKERD_KV_RESULT_TRUNCATED_ATTR,
  WORKERD_KV_VALUE_ATTR,
  WORKERD_KV_VALUE_TRUNCATED_ATTR,
} from "./attributes";
import {
  msToHrTime,
  type ReadableSpan,
  SPAN_KIND_CLIENT,
  SPAN_KIND_SERVER,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_UNSET,
  type SpanStatus,
} from "./readable-span";
import { redactUrlCredentials } from "./url-redaction";

/**
 * Builds spans from shim capture events.
 *
 * Each inbound request becomes a SERVER span and the root of its own trace; every other event of
 * that request becomes a CLIENT span parented under it. The shim supplies the trace and
 * server-span ids (see `CorrelatedEvent`), so building a span needs no memory of earlier events
 * — which is what lets a Worker-hosted sidecar be evicted between two batches of one request
 * without splitting its trace.
 *
 * The `requestId → ids` fallback below exists only for a shim that predates those fields. It is
 * the reason this is a class rather than a function.
 *
 * Shared with the Node recorder's sidecar (`packages/backend-recorder-js/src/sidecar/`), which
 * re-exports it: both sidecars must produce identical spans or a recording made through one
 * cannot be replayed by the machinery built for the other.
 */
export class SpanBuilder {
  /**
   * Legacy fallback ids, keyed by `requestId`. Outbound events usually arrive BEFORE their
   * inbound event (the inbound is only reported once the handler completes), so an entry is
   * created lazily on first sight from either event kind.
   */
  private readonly traceContexts = new Map<string, TraceContextEntry>();

  build(event: CaptureEvent): ReadableSpan | null {
    switch (event.kind) {
      case "inbound":
        return this.buildInboundSpan(event);
      case "outbound":
        return this.buildOutboundSpan(event);
      case "binding":
        return this.buildBindingSpan(event);
      case "kv":
        return this.buildKvSpan(event);
      case "postgres":
        return this.buildPostgresSpan(event);
      default:
        // Wire input, possibly from a newer shim — skip rather than crash.
        return null;
    }
  }

  private buildInboundSpan(event: InboundRequestEvent): ReadableSpan {
    const ids = this.resolveIds(event);
    const url = parseUrl(event.url);
    const attributes = buildHttpAttributes(event, url);

    // Only the SERVER span carries it, matching MetHttpInstrumentation on the Node path: the
    // marker describes where this request's session id came from, and the CLIENT spans under
    // it share the same trace.
    if (event.sessionIdOrigin !== undefined) {
      attributes[SESSION_ID_ORIGIN_ATTR] = event.sessionIdOrigin;
    }

    return {
      name: `${event.method} ${url.path}`,
      kind: SPAN_KIND_SERVER,
      status: buildStatus(event, SPAN_KIND_SERVER),
      startTime: msToHrTime(event.startTimeMs),
      endTime: msToHrTime(event.endTimeMs),
      duration: msToHrTime(Math.max(0, event.endTimeMs - event.startTimeMs)),
      attributes,
      spanContext: () => ({
        traceId: ids.traceId,
        spanId: ids.serverSpanId,
      }),
    };
  }

  private buildOutboundSpan(event: OutboundRequestEvent): ReadableSpan {
    return this.buildHttpClientSpan(
      event,
      CLIENT_TECHNOLOGY_WORKERD_FETCH,
      event.method,
    );
  }

  /**
   * A binding call. Named after the binding rather than the bare method, since the `env` key is
   * what identifies the call — the URL is whatever the app invented.
   */
  private buildBindingSpan(event: BindingRequestEvent): ReadableSpan {
    return this.buildHttpClientSpan(
      event,
      CLIENT_TECHNOLOGY_WORKERD_BINDING,
      `${event.method} ${event.bindingName ?? "$unknown"}`,
      event.bindingName !== undefined
        ? { [WORKERD_BINDING_NAME_ATTR]: event.bindingName }
        : undefined,
    );
  }

  /**
   * A KV operation. Named `kv.<binding>.<operation>` after the Prisma convention
   * (`prisma.<model>.<operation>`) rather than the `METHOD TARGET` shape the HTTP-like spans use
   * — nothing about a KV call is an HTTP method, and the dotted name keeps a `get` on a
   * namespace distinguishable from a `GET` through a service binding at a glance.
   */
  private buildKvSpan(event: KvOperationEvent): ReadableSpan {
    const attributes: Record<string, unknown> = {
      [CLIENT_TECHNOLOGY_ATTR]: CLIENT_TECHNOLOGY_WORKERD_KV,
      [WORKERD_KV_OPERATION_ATTR]: event.operation,
      ...(event.bindingName !== undefined
        ? { [WORKERD_BINDING_NAME_ATTR]: event.bindingName }
        : {}),
      ...(event.key !== undefined ? { [WORKERD_KV_KEY_ATTR]: event.key } : {}),
      ...(event.omitted !== undefined
        ? { [WORKERD_KV_OMITTED_ATTR]: event.omitted }
        : {}),
      ...(event.error !== undefined ? { "error.type": event.error } : {}),
      ...frontendSessionAttribute(event),
    };
    if (event.args !== undefined) {
      attributes[WORKERD_KV_ARGS_ATTR] = event.args.body;
      attributes[WORKERD_KV_ARGS_TRUNCATED_ATTR] = event.args.truncated;
    }
    if (event.value !== undefined) {
      attributes[WORKERD_KV_VALUE_ATTR] = event.value.body;
      attributes[WORKERD_KV_VALUE_TRUNCATED_ATTR] = event.value.truncated;
    }
    if (event.result !== undefined) {
      attributes[WORKERD_KV_RESULT_ATTR] = event.result.body;
      attributes[WORKERD_KV_RESULT_TRUNCATED_ATTR] = event.result.truncated;
    }

    return this.buildClientSpan(
      event,
      `kv.${event.bindingName ?? "$unknown"}.${event.operation}`,
      attributes,
      event.error !== undefined
        ? { code: SPAN_STATUS_ERROR, message: event.error }
        : { code: SPAN_STATUS_UNSET },
    );
  }

  /**
   * A postgres.js query. Name and attributes match what the Node instrumentation emits
   * (`postgresjs.<command>`), because the same store loads both.
   */
  private buildPostgresSpan(event: PostgresQueryEvent): ReadableSpan {
    const attributes: Record<string, unknown> = {
      [CLIENT_TECHNOLOGY_ATTR]: CLIENT_TECHNOLOGY_POSTGRES_JS,
      [POSTGRES_JS_QUERY_TEXT_ATTR]: event.queryText,
      [POSTGRES_JS_QUERY_PARAMS_ATTR]: event.params,
      [POSTGRES_JS_ROW_MODE_ATTR]: event.rowMode,
      ...frontendSessionAttribute(event),
    };
    if (event.result !== undefined) {
      // Re-cap here as well as at capture time: the attribute contract is what the store
      // reads, and a shim that capped differently must not widen it.
      const truncated =
        event.result.truncated ||
        event.result.body.length > MAX_POSTGRES_JS_RESULT_SIZE;
      attributes[POSTGRES_JS_RESULT_ATTR] = truncated
        ? event.result.body.slice(0, MAX_POSTGRES_JS_RESULT_SIZE)
        : event.result.body;
      attributes[POSTGRES_JS_RESULT_TRUNCATED_ATTR] = truncated;
    }
    if (event.errorJson !== undefined) {
      attributes[POSTGRES_JS_ERROR_ATTR] = event.errorJson;
    }

    return this.buildClientSpan(
      event,
      `postgresjs.${postgresJsCommandOf(event.queryText)}`,
      attributes,
      event.errorJson !== undefined
        ? { code: SPAN_STATUS_ERROR }
        : { code: SPAN_STATUS_UNSET },
    );
  }

  private buildHttpClientSpan(
    event: OutboundRequestEvent | BindingRequestEvent,
    technology: string,
    name: string,
    extraAttributes?: Record<string, unknown>,
  ): ReadableSpan {
    const url = parseUrl(event.url);
    const attributes = buildHttpAttributes(event, url);
    attributes[CLIENT_TECHNOLOGY_ATTR] = technology;
    Object.assign(attributes, extraAttributes);
    if (event.requestBody !== undefined) {
      attributes["http.request.body"] = event.requestBody.body;
      attributes["http.request.body.truncated"] = event.requestBody.truncated;
    }
    if (event.responseBody !== undefined) {
      attributes["http.response.body"] = event.responseBody.body;
      attributes["http.response.body.truncated"] = event.responseBody.truncated;
    }

    return this.buildClientSpan(
      event,
      name,
      attributes,
      buildStatus(event, SPAN_KIND_CLIENT),
    );
  }

  private buildClientSpan(
    event: CaptureEvent,
    name: string,
    attributes: Record<string, unknown>,
    status: SpanStatus,
  ): ReadableSpan {
    const ids = this.resolveIds(event);
    const spanId = randomHex(8);
    return {
      name,
      parentSpanId: ids.serverSpanId,
      kind: SPAN_KIND_CLIENT,
      status,
      startTime: msToHrTime(event.startTimeMs),
      endTime: msToHrTime(event.endTimeMs),
      duration: msToHrTime(Math.max(0, event.endTimeMs - event.startTimeMs)),
      attributes,
      spanContext: () => ({ traceId: ids.traceId, spanId }),
    };
  }

  /**
   * The trace and server-span ids for an event: the shim's, when it sent them, and otherwise a
   * pair invented per `requestId` and remembered — the pre-`traceId` behaviour.
   */
  private resolveIds(event: CaptureEvent): TraceContextEntry {
    if (event.traceId !== undefined && event.serverSpanId !== undefined) {
      return {
        traceId: event.traceId,
        serverSpanId: event.serverSpanId,
        lastSeenMs: event.endTimeMs,
      };
    }
    const existing = this.traceContexts.get(event.requestId);
    if (existing) {
      existing.lastSeenMs = event.endTimeMs;
      return existing;
    }
    this.pruneTraceContexts(event.endTimeMs);
    const entry: TraceContextEntry = {
      traceId: randomHex(16),
      serverSpanId: randomHex(8),
      lastSeenMs: event.endTimeMs,
    };
    this.traceContexts.set(event.requestId, entry);
    return entry;
  }

  private pruneTraceContexts(nowMs: number): void {
    if (this.traceContexts.size < TRACE_CONTEXT_PRUNE_THRESHOLD) {
      return;
    }
    for (const [requestId, entry] of this.traceContexts) {
      if (nowMs - entry.lastSeenMs > TRACE_CONTEXT_TTL_MS) {
        this.traceContexts.delete(requestId);
      }
    }
  }
}

interface TraceContextEntry {
  traceId: string;
  serverSpanId: string;
  lastSeenMs: number;
}

const TRACE_CONTEXT_TTL_MS = 10 * 60 * 1000;
const TRACE_CONTEXT_PRUNE_THRESHOLD = 1_000;

const HEX = "0123456789abcdef";

/** WebCrypto rather than `node:crypto`, so this runs in a Worker as well as in Node. */
export const randomHex = (bytes: number): string => {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  let hex = "";
  for (const byte of buffer) {
    hex += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return hex;
};

const capturedHeaders = new Set<string>(CAPTURED_HEADERS);

interface ParsedUrl {
  full: string;
  path: string;
  query: string | undefined;
  scheme: string | undefined;
  host: string | undefined;
  port: number | undefined;
}

const parseUrl = (raw: string): ParsedUrl => {
  try {
    const url = redactUrlCredentials(new URL(raw));
    const defaultPort = url.protocol === "https:" ? 443 : 80;
    return {
      full: url.toString(),
      path: url.pathname,
      query: url.search ? url.search.slice(1) : undefined,
      scheme: url.protocol.replace(/:$/, ""),
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : defaultPort,
    };
  } catch {
    return {
      full: raw,
      path: raw.split("?")[0] || "/",
      query: undefined,
      scheme: undefined,
      host: undefined,
      port: undefined,
    };
  }
};

const frontendSessionAttribute = (
  event: CaptureEvent,
): Record<string, string> =>
  event.frontendSessionId !== undefined
    ? { [FRONTEND_SESSION_ID_ATTR]: event.frontendSessionId }
    : {};

const buildHttpAttributes = (
  event: InboundRequestEvent | OutboundRequestEvent | BindingRequestEvent,
  url: ParsedUrl,
): Record<string, unknown> => {
  const attributes: Record<string, unknown> = {
    "http.request.method": event.method,
    "url.full": url.full,
    "url.path": url.path,
    ...(url.query !== undefined ? { "url.query": url.query } : {}),
    ...(url.scheme !== undefined ? { "url.scheme": url.scheme } : {}),
    ...(url.host !== undefined ? { "server.address": url.host } : {}),
    ...(url.port !== undefined ? { "server.port": url.port } : {}),
    ...(event.statusCode !== undefined
      ? { "http.response.status_code": event.statusCode }
      : {}),
    ...(event.error !== undefined ? { "error.type": event.error } : {}),
    ...frontendSessionAttribute(event),
  };
  // The shim already filters to CAPTURED_HEADERS; re-filter here so a stale or third-party
  // shim can't persist sensitive headers via the sidecar.
  for (const [name, values] of Object.entries(event.requestHeaders)) {
    if (capturedHeaders.has(name.toLowerCase())) {
      attributes[`http.request.header.${name}`] = values;
    }
  }
  for (const [name, values] of Object.entries(event.responseHeaders ?? {})) {
    if (capturedHeaders.has(name.toLowerCase())) {
      attributes[`http.response.header.${name}`] = values;
    }
  }
  return attributes;
};

const buildStatus = (
  event: InboundRequestEvent | OutboundRequestEvent | BindingRequestEvent,
  kind: number,
): SpanStatus => {
  if (event.error !== undefined) {
    return { code: SPAN_STATUS_ERROR, message: event.error };
  }
  // Standard OTel HTTP semantics: client spans error on 4xx/5xx, server spans only on 5xx.
  const errorThreshold = kind === SPAN_KIND_CLIENT ? 400 : 500;
  if (event.statusCode !== undefined && event.statusCode >= errorThreshold) {
    return { code: SPAN_STATUS_ERROR };
  }
  return { code: SPAN_STATUS_UNSET };
};
