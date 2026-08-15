import {
  type CaptureEvent,
  SpanBuilder,
  serializeSpan,
} from "@alwaysmeticulous/backend-recorder-workerd";
import { log } from "./log";
import type { StorageBackend } from "./s3/storage";

/**
 * Assembles capture events into recorded backend sessions and uploads them.
 *
 * A port of `SessionSpanExporter` in the Node recorder, and deliberately a faithful one: the S3
 * layout, the session-id format, the chunk numbering, the 30-chunk / 10-minute rollover and the
 * abandon-after-3-failures marker are all read by ingestion, which cannot tell the two apart and
 * must not have to.
 *
 * One session holds spans from **many** frontend sessions, exactly as the Node sidecar's does;
 * ingestion correlates them by the `meticulous.frontend_session_id` span attribute, never by
 * folder. That is what keeps the number of S3 objects — and therefore the cost of the window scan
 * ingestion does over them — the same as a local recording's.
 */

/** Session ids are `BE_<iso>_<random>`; ingestion parses the timestamp out of the middle. */
const SESSION_ID_PREFIX = "BE_";

/** Both match `SessionSpanExporter`'s. See the note above about rollover. */
const MAX_CHUNKS = 30;
const MAX_SESSION_TIME_MS = 600_000;

/** Consecutive upload failures before the session is abandoned. */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * How long an abandoned session stays abandoned before a fresh one is started.
 *
 * Abandonment exists to stop hammering a storage backend that is failing, which in the Node
 * exporter it does by ending the recording for the life of the process. A Durable Object has no
 * such lifetime — it is addressed by name and its storage outlives any outage — so the same flag
 * kept forever would mean one bad five minutes of S3 silently ends recording for that deployment
 * until someone wipes the object's storage. Waiting this long before trying again keeps the
 * back-off while letting the sidecar recover on its own.
 */
const ABANDON_COOLDOWN_MS = 5 * 60 * 1000;

export interface SessionStoreConfig {
  recordingToken: string;
  meticulousProjectName: string;
  recorderVersion: string;
}

/** The state that has to outlive an eviction, so a flush never loses its place. */
export interface SessionState {
  sessionId: string;
  /** ISO string embedded in the session id, reused in `metadata.json`. */
  startTime: string;
  startedAtMs: number;
  chunkIndex: number;
  metadataUploaded: boolean;
  consecutiveFailures: number;
  abandoned: boolean;
  /** When {@link abandoned} was set, so the cooldown can be measured across evictions. */
  abandonedAtMs?: number;
}

export const newSessionState = (
  nowMs: number,
  randomId: string,
): SessionState => {
  const startTime = new Date(nowMs).toISOString();
  return {
    sessionId: `${SESSION_ID_PREFIX}${startTime}_${randomId}`,
    startTime,
    startedAtMs: nowMs,
    chunkIndex: 0,
    metadataUploaded: false,
    consecutiveFailures: 0,
    abandoned: false,
  };
};

export interface FlushResult {
  state: SessionState;
  /** True when this flush rolled over to a fresh session before writing. */
  rolledOver: boolean;
}

/**
 * Uploads one chunk of events, advancing and returning the session state.
 *
 * Every span in a chunk is built by one `SpanBuilder` pass. Because the shim stamps each event
 * with its request's trace and server-span ids, that pass needs no memory of earlier chunks — so
 * splitting a request's events across two flushes, or handling them in two evictions of this
 * object, still yields one connected trace.
 */
export const flushChunk = async (
  events: CaptureEvent[],
  state: SessionState,
  storage: StorageBackend,
  config: SessionStoreConfig,
  nowMs: number,
  randomId: string,
): Promise<FlushResult> => {
  if (events.length === 0) {
    return { state, rolledOver: false };
  }
  // An abandoned session is dead, but the object holding it is not: wait out the back-off and
  // then start a fresh one, rather than letting one outage end recording permanently.
  if (state.abandoned && !abandonCooldownElapsed(state, nowMs)) {
    return { state, rolledOver: false };
  }

  let current = state;
  let rolledOver = false;
  const rollReason = state.abandoned
    ? "recovering_from_abandoned"
    : sessionFullReason(current, nowMs);
  if (rollReason !== undefined) {
    log.info(
      `Session ${current.sessionId} is ending (${rollReason}) — rolling over to a new session`,
    );
    current = newSessionState(nowMs, randomId);
    rolledOver = true;
  }

  const builder = new SpanBuilder();
  const spans = events
    .map((event) => builder.build(event))
    .filter((span) => span !== null)
    .map((span) => serializeSpan(span));
  if (spans.length === 0) {
    return { state: current, rolledOver };
  }

  if (!current.metadataUploaded) {
    try {
      await storage.write(
        `${s3Prefix(config.recordingToken, current.sessionId)}/metadata.json`,
        buildMetadata(current, config),
      );
      current = { ...current, metadataUploaded: true };
    } catch (error) {
      // Without metadata.json ingestion cannot read the session at all, so there is nothing to
      // gain by uploading chunks under it.
      log.error(`Failed to upload metadata.json: ${String(error)}`);
      return {
        state: await abandon(
          current,
          storage,
          config,
          "metadata_upload_failed",
          nowMs,
        ),
        rolledOver,
      };
    }
  }

  const chunkIndex = current.chunkIndex + 1;
  try {
    await storage.write(
      `${s3Prefix(config.recordingToken, current.sessionId)}/${chunkIndex}`,
      { backendRecorderToken: config.recordingToken, spans },
    );
    // `info`, not `debug`: this is the one line that proves a deployment is recording, and the
    // README tells people to look for it in `wrangler tail`. At debug it would be invisible at the
    // default level, making that instruction wrong.
    log.info(
      `Wrote chunk ${chunkIndex} of ${current.sessionId} with ${spans.length} span(s)`,
    );
    return {
      state: { ...current, chunkIndex, consecutiveFailures: 0 },
      rolledOver,
    };
  } catch (error) {
    const consecutiveFailures = current.consecutiveFailures + 1;
    log.error(
      `Failed to write chunk ${chunkIndex} of ${current.sessionId} (consecutive failures: ${consecutiveFailures}): ${String(error)}`,
    );
    const failed = { ...current, consecutiveFailures };
    return {
      state:
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
          ? await abandon(
              failed,
              storage,
              config,
              "consecutive_failures",
              nowMs,
            )
          : failed,
      rolledOver,
    };
  }
};

const abandonCooldownElapsed = (state: SessionState, nowMs: number): boolean =>
  // A state written before this field existed has no timestamp to measure from; treating it as
  // elapsed recovers such an object on its next report rather than leaving it dead forever.
  state.abandonedAtMs === undefined ||
  nowMs - state.abandonedAtMs >= ABANDON_COOLDOWN_MS;

const sessionFullReason = (
  state: SessionState,
  nowMs: number,
): "max_chunks" | "max_session_time" | undefined => {
  if (state.chunkIndex >= MAX_CHUNKS) {
    return "max_chunks";
  }
  if (nowMs - state.startedAtMs >= MAX_SESSION_TIME_MS) {
    return "max_session_time";
  }
  return undefined;
};

/**
 * Marks the session unusable and leaves a marker saying so, rather than letting ingestion read a
 * silently-short recording as a complete one.
 */
const abandon = async (
  state: SessionState,
  storage: StorageBackend,
  config: SessionStoreConfig,
  reason: "consecutive_failures" | "metadata_upload_failed",
  nowMs: number,
): Promise<SessionState> => {
  log.error(
    `Abandoning session ${state.sessionId}: ${reason} — recording resumes under a new session after ${ABANDON_COOLDOWN_MS / 1000}s`,
  );
  try {
    await storage.write(
      `${s3Prefix(config.recordingToken, state.sessionId)}/abandoned.json`,
      { abandoned: true, reason },
    );
  } catch {
    log.warn("Failed to upload the abandoned.json marker");
  }
  return { ...state, abandoned: true, abandonedAtMs: nowMs };
};

/**
 * `<first 12 chars of the token>/<session id>`. Ingestion lists this prefix to find a project's
 * backend recordings, so the truncation length is part of the contract.
 */
const s3Prefix = (recordingToken: string, sessionId: string): string =>
  recordingToken ? `${recordingToken.slice(0, 12)}/${sessionId}` : sessionId;

const buildMetadata = (
  state: SessionState,
  config: SessionStoreConfig,
): Record<string, unknown> => ({
  projectID: config.recordingToken,
  source: "backend-recorder",
  environment: "development",
  meticulousProjectName: config.meticulousProjectName,
  recorderVersion: config.recorderVersion,
  config: {
    sessionId: state.sessionId,
    maxChunks: MAX_CHUNKS,
    maxSessionTimeMs: MAX_SESSION_TIME_MS,
    startTime: state.startTime,
  },
  runtime: { platform: "workerd" },
});
