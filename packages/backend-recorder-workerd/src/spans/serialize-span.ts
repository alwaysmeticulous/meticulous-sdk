import { CLIENT_TECHNOLOGY_ATTR, FRONTEND_SESSION_ID_ATTR } from "./attributes";
import {
  hrTimeToMs,
  type ReadableSpan,
  type SerializedSpanBase,
} from "./readable-span";

/**
 * Turns a span into the JSON shape a recorded backend session stores.
 *
 * Shared by the Node exporter and the Worker-hosted sidecar so the two cannot drift: ingestion
 * and every replay mock store read these field names, and a sidecar writing a near-miss of
 * this shape would produce recordings that load but never match.
 */
export const serializeSpan = (span: ReadableSpan): SerializedSpanBase => {
  const ctx = span.spanContext();
  // Copy so we never mutate the live OTel span's attributes.
  const attributes = { ...(span.attributes ?? {}) };

  const clientTechnology = attributes[CLIENT_TECHNOLOGY_ATTR] as
    | string
    | undefined;
  const frontendSessionId = attributes[FRONTEND_SESSION_ID_ATTR] as
    | string
    | undefined;

  // client_technology moves to the top level; frontend_session_id is copied (left in place for
  // backward compatibility — see download-sessions.ts in the webapp repo).
  delete attributes[CLIENT_TECHNOLOGY_ATTR];

  return {
    name: span.name,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanId ?? span.parentSpanContext?.spanId,
    kind: span.kind,
    status: span.status,
    startTimeMs: hrTimeToMs(span.startTime),
    endTimeMs: hrTimeToMs(span.endTime),
    durationMs: hrTimeToMs(span.duration),
    // Spread conditionally so we never emit `key: undefined` (exactOptionalPropertyTypes).
    ...(clientTechnology ? { clientTechnology } : {}),
    ...(frontendSessionId ? { frontendSessionId } : {}),
    attributes,
  };
};
