/**
 * The span shape both recording surfaces produce, and the serialization that turns it into the
 * JSON a recorded session is stored as.
 *
 * Lives here rather than in the Node recorder because a Worker-hosted sidecar has to write the
 * same wire format from inside workerd, where neither `@opentelemetry/api` nor the Node
 * recorder's bundle can be loaded. `packages/backend-recorder-js/src/exporters/span-serializer.ts`
 * re-exports all of this and layers its richer, per-instrumentation attribute types on top, so
 * the *logic* has exactly one implementation while the documentation types stay where they are
 * used.
 */

/**
 * OpenTelemetry's `SpanKind`, inlined. The shim has no runtime dependencies — pulling in
 * `@opentelemetry/api` for two numeric enums would put it in every customer's worker bundle.
 */
export const SPAN_KIND_INTERNAL = 0;
export const SPAN_KIND_SERVER = 1;
export const SPAN_KIND_CLIENT = 2;

/** OpenTelemetry's `SpanStatusCode`, inlined for the same reason. */
export const SPAN_STATUS_UNSET = 0;
export const SPAN_STATUS_OK = 1;
export const SPAN_STATUS_ERROR = 2;

export interface SpanStatus {
  code: number;
  message?: string;
}

/** `[seconds, nanoseconds]` — OpenTelemetry's `HrTime`. */
export type HrTime = [number, number];

export interface ReadableSpan {
  name: string;
  /**
   * Set by the hand-built spans in `span-builder.ts`. OTel-SDK spans carry the parent in
   * {@link ReadableSpan.parentSpanContext} instead.
   */
  parentSpanId?: string;
  /**
   * How an OTel-SDK span reports its parent since `@opentelemetry/sdk-trace-base` v2, which
   * dropped the flat `parentSpanId` field.
   */
  parentSpanContext?: { spanId: string };
  kind: number;
  status: unknown;
  startTime: HrTime;
  endTime: HrTime;
  duration: HrTime;
  attributes?: Record<string, unknown>;
  spanContext(): { traceId: string; spanId: string };
}

/**
 * A serialized span, with the attribute bag left open. The Node recorder narrows `attributes`
 * to its union of per-instrumentation contracts; nothing about the wire format depends on that
 * narrowing.
 */
export interface SerializedSpanBase {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  kind: number;
  status: unknown;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  clientTechnology?: string;
  frontendSessionId?: string;
  attributes: Record<string, unknown>;
}

export const hrTimeToMs = (hrTime: HrTime): number =>
  hrTime[0] * 1000 + hrTime[1] / 1e6;

export const msToHrTime = (ms: number): HrTime => {
  const seconds = Math.floor(ms / 1000);
  return [seconds, Math.round((ms - seconds * 1000) * 1e6)];
};
