import { warnOnce } from "./log";
import type { CaptureEvent } from "./protocol";
import { postCaptureEvents } from "./sidecar-client";
import type { SidecarTransport } from "./sidecar-transport";

/**
 * Batches one request's capture events into a single report to the sidecar.
 *
 * A local `wrangler dev` recording could afford a POST per event over loopback. A deployed
 * Worker cannot: each one is a subrequest, and — with a service-binding transport — an extra
 * hop the runtime has to keep the request context alive for. An SSR request making twenty
 * outbound calls should cost one report, not twenty.
 *
 * Batching means the report has to wait for work that finishes *after* the handler returns: a
 * response body is only captured once its clone has been drained. So producers register here
 * with {@link track} instead of each holding its own `waitUntil`, and {@link close} — the single
 * promise the wrapper hands to `waitUntil` — drains them before sending.
 */
export class CaptureBuffer {
  private events: CaptureEvent[] = [];
  private bufferedChars = 0;
  private readonly pending = new Set<Promise<void>>();
  /** Chained so two flushes can never interleave and reorder a session's chunks. */
  private sending: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly transport: SidecarTransport,
    private readonly waitUntil: (promise: Promise<unknown>) => void,
  ) {}

  /**
   * Registers work that will add zero or more events. Never rejects: a producer that throws is
   * warned about once and dropped, exactly as an unbatched capture failure was.
   */
  track(
    producer: () => Promise<void>,
    warnKey: string,
    warnMessage: string,
  ): void {
    const promise = producer()
      .catch((error) => {
        warnOnce(warnKey, warnMessage, error);
      })
      .finally(() => {
        this.pending.delete(promise);
      });
    this.pending.add(promise);
    // A closed buffer has no `close()` left to await this, so it needs its own lifetime
    // extension — see the same reasoning in `add`.
    if (this.closed) {
      this.waitUntil(promise);
    }
  }

  /**
   * Buffers one event, sending early if the buffer has grown past {@link MAX_BUFFERED_CHARS}.
   *
   * The early send matters for exactly the requests batching is riskiest for: a long-lived SSE
   * response, or a handler making many body-carrying calls, would otherwise hold every captured
   * body in isolate memory until the request ended.
   */
  add(event: CaptureEvent): void {
    if (this.closed) {
      // Work the app itself queued in `waitUntil` can still make calls after our own `close()`
      // has run. Report those the old way rather than dropping them.
      this.waitUntil(this.send([event]));
      return;
    }
    this.events.push(event);
    this.bufferedChars += estimateChars(event);
    if (this.bufferedChars >= MAX_BUFFERED_CHARS) {
      this.waitUntil(this.flush());
    }
  }

  /**
   * Drains every producer and sends what they buffered, repeating while draining produces more
   * work (a body read that starts another capture). Idempotent; after it resolves the buffer is
   * closed and later events are sent individually.
   */
  async close(): Promise<void> {
    for (let round = 0; round < MAX_DRAIN_ROUNDS; round++) {
      if (this.pending.size === 0) {
        break;
      }
      await Promise.all([...this.pending]);
    }
    this.closed = true;
    await this.flush();
  }

  private flush(): Promise<void> {
    if (this.events.length === 0) {
      return this.sending;
    }
    const batch = this.events;
    this.events = [];
    this.bufferedChars = 0;
    this.sending = this.sending.then(() => this.send(batch));
    return this.sending;
  }

  /** `postCaptureEvents` never rejects — it warns once on an unreachable sidecar. */
  private send(events: CaptureEvent[]): Promise<void> {
    return postCaptureEvents(this.transport, events);
  }
}

/**
 * Buffered-payload ceiling, in JSON characters. Two 256 KB bodies per event means a handful of
 * body-carrying calls reaches this; the sidecar's own payload limit is 8 MB, so a batch built to
 * this bound always fits with room for JSON escaping.
 */
const MAX_BUFFERED_CHARS = 2 * 1024 * 1024;

/**
 * Bounds `close()` in the pathological case where every drained producer starts another. Capture
 * is a leaf operation, so one round is the norm and two the most a body read can cause.
 */
const MAX_DRAIN_ROUNDS = 4;

/**
 * Rough size of an event, counting only the fields that can be large. Cheaper than
 * `JSON.stringify` on the whole event, and this only needs to be right to within a factor.
 */
const estimateChars = (event: CaptureEvent): number => {
  let chars = 256;
  if ("requestBody" in event && event.requestBody !== undefined) {
    chars += event.requestBody.body.length;
  }
  if ("responseBody" in event && event.responseBody !== undefined) {
    chars += event.responseBody.body.length;
  }
  if ("result" in event && event.result !== undefined) {
    chars += event.result.body.length;
  }
  if ("value" in event && event.value !== undefined) {
    chars += event.value.body.length;
  }
  if ("args" in event && event.args !== undefined) {
    chars += event.args.body.length;
  }
  if ("queryText" in event) {
    chars += event.queryText.length + event.params.length;
  }
  return chars;
};
