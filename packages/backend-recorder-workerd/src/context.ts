import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-inbound-request context, entered by the withMeticulous wrapper and read
 * by the fetch patch. Requires the `nodejs_als` (or `nodejs_compat`)
 * compatibility flag in the worker's wrangler configuration.
 */
export interface RequestCaptureContext {
  requestId: string;
  frontendSessionId: string | undefined;
  /** Normalized origin of the sidecar, e.g. "http://127.0.0.1:9670". No trailing slash. */
  sidecarUrl: string;
  /** The inbound request's ctx.waitUntil, for post-response capture work. */
  waitUntil: (promise: Promise<unknown>) => void;
}

export const requestCaptureContext =
  new AsyncLocalStorage<RequestCaptureContext>();
