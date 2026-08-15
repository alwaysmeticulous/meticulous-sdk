import {
  type CaptureEvent,
  randomHex,
} from "@alwaysmeticulous/backend-recorder-workerd";
import { resolveSidecarConfig, type SidecarEnv } from "./env";
import { log, setLogLevel } from "./log";
import { S3StorageBackend, type StorageBackend } from "./s3/storage";
import {
  flushChunk,
  newSessionState,
  type SessionState,
} from "./session-store";

/**
 * The Durable Object that owns a recorded backend session: it buffers the batches the app's Worker
 * reports and uploads them as chunks.
 *
 * **Why a Durable Object at all.** The sidecar's `fetch` runs in an ordinary Worker isolate, of
 * which there are many and each is short-lived. Buffering there would mint a session per isolate,
 * with no reliable timer to flush it. This object is single-threaded and addressed by name, so it
 * is the one place a monotonic chunk index and a single session id can live — and `alarm()` is the
 * only scheduling primitive in a Worker that survives having no request in flight.
 *
 * **Why storage, not memory.** An alarm survives eviction; instance fields do not. A batch held
 * only in memory would be lost whenever the object is evicted between the report and the flush, so
 * every batch is persisted the moment it arrives and the alarm drains from storage.
 *
 * **One object, many frontend sessions** — the same fan-in the Node sidecar has. Sharding is by
 * `METICULOUS_SIDECAR_SHARDS` and is free: nothing downstream keys off which object a span passed
 * through, only off the `meticulous.frontend_session_id` attribute on the span itself.
 */

/** Key prefix for pending batches. One key per batch, never one growing array — see below. */
const BATCH_KEY_PREFIX = "batch:";
const STATE_KEY = "session";
const NEXT_SEQ_KEY = "seq";

/**
 * How long a batch waits for company before being uploaded. Matches the Node exporter's
 * `flushIntervalMs`, so chunk sizes and upload rates look the same in a cloud recording as in a
 * local one.
 */
const FLUSH_DELAY_MS = 5_000;

/**
 * Batches drained per flush. A batch can carry two 256 KB bodies, so this bounds one chunk — and
 * the isolate memory it is built in — at a few tens of MB worst case. Anything left over re-arms
 * the alarm immediately rather than waiting another interval.
 */
const MAX_BATCHES_PER_FLUSH = 64;

/** Structural subset of the Durable Object storage API the object uses. */
interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  /** Multi-key form. Atomic, which is why the batches and their counter go through it together. */
  put(entries: Record<string, unknown>): Promise<void>;
  delete(keys: string | string[]): Promise<boolean | number>;
  list<T>(options: { prefix: string; limit?: number }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
}

/** Structural subset of `DurableObjectState`. */
export interface DurableContext {
  storage: DurableStorage;
  blockConcurrencyWhile?<T>(callback: () => Promise<T>): Promise<T>;
}

/**
 * Exported as a Durable Object class from the sidecar Worker. Written as a plain class rather than
 * extending `DurableObject` from `cloudflare:workers` so this package needs no Cloudflare runtime
 * import; workerd only requires the constructor shape and the handler names.
 */
export class MeticulousRecorderSession {
  private readonly storage: DurableStorage;
  private readonly env: SidecarEnv;
  private storageBackend: StorageBackend | undefined;

  constructor(ctx: DurableContext, env: SidecarEnv) {
    this.storage = ctx.storage;
    this.env = env;
    setLogLevel(env.METICULOUS_LOG_LEVEL);
  }

  /**
   * Accepts one batch of capture events, or a flush request. Answers as soon as the batch is
   * durable — the upload happens on the alarm, off the app's `waitUntil`.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/flush") {
      await this.drain();
      return new Response(null, { status: 204 });
    }

    const events = (await request.json()) as CaptureEvent[];
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(null, { status: 204 });
    }
    try {
      await this.append(events);
    } catch (error) {
      // 204 here would tell the Worker — and through it the shim — that these events are durable
      // when the write had just failed. Nothing retries, so the status is the only signal.
      log.error(`Failed to buffer ${events.length} event(s): ${String(error)}`);
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    await this.drain();
  }

  private async append(events: CaptureEvent[]): Promise<void> {
    const seq = (await this.storage.get<number>(NEXT_SEQ_KEY)) ?? 0;
    const groups = splitToFitValueLimit(events);

    // Armed before the write, so a crash in between leaves an alarm with nothing to drain — which
    // costs one no-op wake-up — rather than durable events with no alarm to upload them, which
    // would strand them until the next report happened to arrive.
    if ((await this.storage.getAlarm()) === null) {
      await this.storage.setAlarm(Date.now() + FLUSH_DELAY_MS);
    }

    // One `put` for the batches and the counter together: the multi-key form is atomic, so an
    // eviction can never land between them and leave the counter behind, which would make the
    // next report overwrite these events under the same key.
    const entries: Record<string, unknown> = {
      [NEXT_SEQ_KEY]: seq + groups.length,
    };
    groups.forEach((group, index) => {
      entries[`${BATCH_KEY_PREFIX}${pad(seq + index)}`] = group;
    });
    await this.storage.put(entries);
  }

  private async drain(): Promise<void> {
    const pending = await this.storage.list<CaptureEvent[]>({
      prefix: BATCH_KEY_PREFIX,
      limit: MAX_BATCHES_PER_FLUSH,
    });
    if (pending.size === 0) {
      return;
    }

    const events = [...pending.values()].flat();
    const config = resolveSidecarConfig(this.env);
    const nowMs = Date.now();
    const state =
      (await this.storage.get<SessionState>(STATE_KEY)) ??
      newSessionState(nowMs, randomHex(8));

    const { state: nextState } = await flushChunk(
      events,
      state,
      this.getStorageBackend(),
      config,
      nowMs,
      randomHex(8),
    );

    // Written before the batches are dropped, so a crash in between re-uploads a chunk rather
    // than losing one. A duplicate chunk is harmless — ingestion reads spans, and a repeated span
    // matches the same way — whereas a lost chunk is a gap in the recording.
    await this.storage.put(STATE_KEY, nextState);
    await this.storage.delete([...pending.keys()]);

    if (nextState.abandoned) {
      // Nothing more can be uploaded under this session, and holding batches for one that will
      // never be read would grow storage without limit.
      await this.dropEverythingPending();
      return;
    }

    // More arrived while this chunk was uploading, or the drain was capped.
    const remaining = await this.storage.list<CaptureEvent[]>({
      prefix: BATCH_KEY_PREFIX,
      limit: 1,
    });
    if (remaining.size > 0 && (await this.storage.getAlarm()) === null) {
      // A capped drain is a backlog, not a batch waiting for company: work it off now rather than
      // letting a burst take an extra interval per MAX_BATCHES_PER_FLUSH of it.
      const wasCapped = pending.size === MAX_BATCHES_PER_FLUSH;
      await this.storage.setAlarm(
        wasCapped ? Date.now() : Date.now() + FLUSH_DELAY_MS,
      );
    }
  }

  private async dropEverythingPending(): Promise<void> {
    while (true) {
      const pending = await this.storage.list<CaptureEvent[]>({
        prefix: BATCH_KEY_PREFIX,
        limit: MAX_BATCHES_PER_FLUSH,
      });
      if (pending.size === 0) {
        return;
      }
      await this.storage.delete([...pending.keys()]);
    }
  }

  private getStorageBackend(): StorageBackend {
    // Held across flushes so the Cognito credentials are fetched once rather than per chunk.
    this.storageBackend ??= new S3StorageBackend(
      resolveSidecarConfig(this.env).storage,
    );
    return this.storageBackend;
  }
}

/** Zero-padded so `list` returns batches in arrival order, which `Map` preserves. */
const pad = (seq: number): string => String(seq).padStart(12, "0");

/**
 * Splits one report into groups that each fit a Durable Object storage value.
 *
 * A SQLite-backed object caps a key/value pair at 2 MB, and one report is not bounded by that: the
 * shim flushes *once past* ~2 MB of estimated body text, so the event that crossed the line is
 * still in the batch, its estimate ignores every field but the bodies, and JSON escaping inflates
 * what is actually written. A batch arriving over the limit would fail its `put` and lose the
 * whole request's spans, so it is split instead.
 *
 * An event too large on its own is still written alone: nothing can be done to make it fit, and
 * failing that one `put` loses only it.
 */
export const splitToFitValueLimit = (
  events: CaptureEvent[],
): CaptureEvent[][] => {
  const groups: CaptureEvent[][] = [];
  let current: CaptureEvent[] = [];
  let currentChars = 0;
  for (const event of events) {
    const chars = JSON.stringify(event)?.length ?? 0;
    if (current.length > 0 && currentChars + chars > MAX_VALUE_CHARS) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(event);
    currentChars += chars;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
};

/**
 * Character budget per stored value. Half the 2 MB limit, because the measurement is UTF-16 code
 * units of the JSON while the limit counts UTF-8 bytes of the whole entry — a body of non-ASCII
 * text can be three bytes to the unit, and the key and array punctuation are on top.
 */
const MAX_VALUE_CHARS = 1024 * 1024;
