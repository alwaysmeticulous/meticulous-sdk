import { AsyncLocalStorage } from "node:async_hooks";
import type { CaptureBuffer } from "./capture-buffer";
import { type SidecarTransport, transportOrigin } from "./sidecar-transport";

/**
 * Per-inbound-request context, entered by the withMeticulous wrapper and read by the fetch
 * patch. Requires the `nodejs_als` (or `nodejs_compat`) compatibility flag in the worker's
 * wrangler configuration.
 */
interface BaseRequestContext {
  requestId: string;
  /** The inbound request's ctx.waitUntil, for post-response capture work. */
  waitUntil: (promise: Promise<unknown>) => void;
  /**
   * Per-request line-coverage sink, indexed by the global line id the build
   * plugin assigned. Present only when the bundle is instrumented and the
   * request is being replayed.
   *
   * Lives here rather than in a module-scope global because workerd interleaves
   * concurrent requests in one isolate — a shared sink would merge sessions'
   * coverage together.
   */
  coverage?: Uint8Array;
}

/** Recording: capture events are reported to the sidecar, which stays out of the request path. */
export interface RequestCaptureContext extends BaseRequestContext {
  mode: "record";
  frontendSessionId: string | undefined;
  /**
   * Set only when we minted {@link frontendSessionId} ourselves for a document navigation the
   * browser could not tag, rather than reading it off the request. Recorded on the inbound
   * event so ingestion can tell an id the page may never have adopted from one it sent us.
   * See provisional-session-id.ts.
   */
  sessionIdOrigin?: "backend";
  transport: SidecarTransport;
  /** Batches this request's events into one report. */
  buffer: CaptureBuffer;
  /**
   * Trace this request's spans belong to, and the id of its SERVER span. Minted here rather than
   * by the sidecar so span assembly needs no cross-batch memory — see `CorrelatedEvent`.
   */
  traceId: string;
  serverSpanId: string;
}

/**
 * Replaying: outbound calls are looked up against the sidecar's mock store before they leave the
 * worker.
 *
 * Both ids are required here, unlike recording. Mocks are indexed by session and their
 * consume-once state is isolated by replay, so omitting either would make deterministic
 * lookup impossible. Making both non-optional keeps that state unrepresentable.
 *
 * Replay is URL-only, deliberately: the sidecar URL arrives on a request header the replay runner
 * injects, validated down to a loopback / docker-gateway / private-network origin. There is no
 * binding transport here because a replay sidecar is a Node process holding the mock store, never
 * a Worker.
 */
export interface RequestReplayContext extends BaseRequestContext {
  mode: "replay";
  frontendSessionId: string;
  replayId: string;
  /** Normalized origin of the sidecar, e.g. "http://127.0.0.1:9670". No trailing slash. */
  sidecarUrl: string;
  /**
   * Instant to freeze the worker's clock at while serving this session, or undefined to leave the
   * real clock alone.
   */
  clockAnchorMs: number | undefined;
}

export type RequestContext = RequestCaptureContext | RequestReplayContext;

export const requestCaptureContext = new AsyncLocalStorage<RequestContext>();

/** The origin the shim's own sidecar traffic goes to, for the self-capture guards. */
export const sidecarOriginOf = (ctx: RequestContext): string =>
  ctx.mode === "replay" ? ctx.sidecarUrl : transportOrigin(ctx.transport);
