import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-inbound-request context, entered by the withMeticulous wrapper and read
 * by the fetch patch. Requires the `nodejs_als` (or `nodejs_compat`)
 * compatibility flag in the worker's wrangler configuration.
 */
interface BaseRequestContext {
  requestId: string;
  /** Normalized origin of the sidecar, e.g. "http://127.0.0.1:9670". No trailing slash. */
  sidecarUrl: string;
  /** The inbound request's ctx.waitUntil, for post-response capture work. */
  waitUntil: (promise: Promise<unknown>) => void;
}

/** Recording: capture events are reported to the sidecar, which stays out of the request path. */
export interface RequestCaptureContext extends BaseRequestContext {
  mode: "record";
  frontendSessionId: string | undefined;
}

/**
 * Replaying: outbound calls are looked up against the sidecar's mock store before they
 * leave the worker.
 *
 * `frontendSessionId` is required here, unlike recording. Mocks are indexed per session, so
 * a replay context without one could only ever miss — and every miss falls through to the
 * real upstream. Making it non-optional keeps that silently-wrong state unrepresentable.
 */
export interface RequestReplayContext extends BaseRequestContext {
  mode: "replay";
  frontendSessionId: string;
  /**
   * Instant to freeze the worker's clock at while serving this session, or undefined to
   * leave the real clock alone.
   */
  clockAnchorMs: number | undefined;
}

export type RequestContext = RequestCaptureContext | RequestReplayContext;

export const requestCaptureContext = new AsyncLocalStorage<RequestContext>();
