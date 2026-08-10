/**
 * A Prisma Client extension object (`{ name, query: { $allOperations } }`). A plain
 * object, safe to pass to `client.$extends(...)` across module/bundle boundaries.
 * Declared structurally here to avoid a dependency on the recorder or `@prisma/client`.
 */
export interface MeticulousPrismaExtension {
  name: string;
  query: {
    $allOperations: (params: {
      model?: string;
      operation: string;
      args: unknown;
      query: (args: unknown) => Promise<unknown>;
    }) => Promise<unknown>;
  };
}

/**
 * Wraps an ioredis client (`Redis` or `Cluster`) so its commands are recorded (record mode)
 * or served from recordings (replay mode), returning the same client. Apply it where you
 * construct the client: `const redis = handle.withMeticulousIORedis(new Redis(url))`. Safe
 * to call across the bundle boundary.
 */
export type MeticulousIORedisWrapper = <T>(client: T) => T;

/**
 * Wraps a postgres.js `sql` instance so its queries are recorded (record mode) or served from
 * recordings (replay mode), returning the same instance. Apply it where you construct the
 * client: `const sql = handle.withMeticulousPostgres(postgres(connectionString))`. Safe to call
 * across the bundle boundary.
 */
export type MeticulousPostgresJsWrapper = <T>(sql: T) => T;

/** Identifies one wrapped operation to the recorder. See {@link MeticulousOperationWrapper}. */
export interface MeticulousOperationSpec {
  /**
   * Stable identity of the operation, e.g. `"crm.getUser"`.
   *
   * **Renaming it invalidates every existing recording.** A test run compares against a base
   * recorded days or weeks earlier, so a rename makes the head replay miss on every call to
   * this operation, which fails the request. Rename deliberately, not incidentally.
   */
  name: string;

  /**
   * The inputs that distinguish one call to this operation from another — typically the
   * arguments the wrapped function closes over. Defaults to `{}`, which is right for an
   * operation taking no meaningful input: every call then shares one key, and recorded
   * results are served in recorded order.
   *
   * Must be JSON-serializable. Leave out values that differ per call but do not select the
   * result (a request id, a trace id, a nonce) — they cannot match across a recording and a
   * replay, and including them turns every call into a miss.
   */
  key?: unknown;
}

/**
 * Wraps one call so it is recorded (record mode) or served from a recording (replay mode),
 * returning whatever the wrapped function returns. Safe to call across the bundle boundary.
 *
 * `const user = await handle.withMeticulousOperation({ name: "crm.getUser", key: { id } }, () => crm.getUser(id))`
 *
 * In replay mode the wrapped function is **not called** — the recorded outcome is returned or
 * thrown. Synchronous functions stay synchronous on both paths.
 */
export type MeticulousOperationWrapper = <T>(
  spec: MeticulousOperationSpec,
  fn: () => T,
) => T;

/**
 * Records a value into the session without stubbing anything. Never throws and never changes
 * control flow; replay ignores observations entirely.
 */
export type MeticulousObservationRecorder = (
  name: string,
  value: unknown,
) => void;

/**
 * Whether the recorder is replaying, and so whether to read a recorded outcome instead of doing
 * the real work — the branch the split API below is built around. The branch is unavoidable in
 * that form: the app keeps the invocation, so only the app can stop the real call happening.
 *
 * Prefer it to an env var of your own. `METICULOUS_BUILD` marks the image, which is the same one
 * in both modes, so branching on it would never record anything; `METICULOUS_BACKEND_RECORDER_MODE`
 * is the mode the process was asked for, whereas this is true only when the recorder actually
 * initialised into replay.
 */
export type MeticulousReplayCheck = () => boolean;

/**
 * Returns the outcome recorded under `name` — the replay half of the split API. Throws when
 * not replaying and when there is no recording to read; the cast is unchecked, since the
 * recording is JSON. See {@link MeticulousValueRecorder}.
 */
export type MeticulousStubReader = <T = unknown>(name: string) => T;

/**
 * Records `value` under `name` so {@link MeticulousStubReader} can serve it back — the record
 * half of the split API, for an app that branches itself rather than handing us its call:
 *
 * ```ts
 * if (handle.isMeticulousReplaying()) return handle.stubWithMeticulous(`user_${id}`);
 * const user = crm.getUser(id);
 * handle.recordWithMeticulous(`user_${id}`, user);
 * return user;
 * ```
 *
 * A promise records its resolved value (or its rejection) and is handed back untouched. A
 * *thrown* error is not captured — only `withMeticulousOperation` sees the call itself.
 */
export type MeticulousValueRecorder = (name: string, value: unknown) => void;

export interface BackendRecorderHandle {
  stopRecording: () => Promise<void>;

  /**
   * The Meticulous Prisma Client extension. Apply it with `client.$extends(...)`
   * so the client's operations are recorded (record mode) or served from
   * recordings (replay mode).
   *
   * This is required to capture Prisma in apps bundled by Next.js / Turbopack
   * (and similar): there the Prisma client and its `pg` driver are bundled into
   * the server chunk, so the recorder's require-hook instrumentation can never
   * patch them. The only seam is the app's own code, so apply the extension
   * where you construct the client:
   *
   *   const handle = await initBackendRecorder(config);
   *   const prisma = rawClient.$extends(handle.meticulousPrismaExtension).$extends(...others);
   *
   * IMPORTANT — ordering: apply it FIRST/outermost, on the raw client, before any
   * other extension (notably `@prisma/extension-read-replicas` and field
   * encryption). It must run before read routing so a single application captures
   * primary + replica operations exactly once with replay-stable keys; applied
   * last (innermost) instead, read-replicas routes reads to a separate, unwrapped
   * replica client and those reads are never captured. The `$allOperations` hook
   * routes each operation at query time, so it is safe to apply at module-load
   * time; when the recorder is disabled or uninitialised it passes through (no-op).
   *
   * Optional so older recorder bundles (which predate this field) still satisfy
   * the type; guard with `handle?.meticulousPrismaExtension`.
   */
  meticulousPrismaExtension?: MeticulousPrismaExtension;

  /**
   * The Meticulous ioredis wrapper. Apply it to your Redis client
   * (`const redis = handle.withMeticulousIORedis(new Redis(url))`) so its commands are
   * recorded (record mode) or served from recordings (replay mode).
   *
   * Required to capture ioredis in apps bundled by Next.js / Turbopack (and similar): there
   * `ioredis` is bundled into the server chunk, so the recorder's require-hook
   * instrumentation can never patch `Redis.prototype.sendCommand`. The only seam is the app's
   * own code, so wrap the client where you construct it. Unlike Prisma there is no native
   * ioredis extension API, so the wrapper replaces `sendCommand` on the client instance;
   * being instance-level it covers both `Redis` and `Cluster`. The replacement dispatches at
   * command time, so it is safe to apply at module-load time; when the recorder is disabled or
   * uninitialised it passes through (no-op).
   *
   * Optional so older recorder bundles (which predate this field) still satisfy the type;
   * guard with `handle?.withMeticulousIORedis`.
   */
  withMeticulousIORedis?: MeticulousIORedisWrapper;

  /**
   * The Meticulous postgres.js wrapper. Apply it to your `sql` instance
   * (`const sql = handle.withMeticulousPostgres(postgres(connectionString))`) so its queries
   * are recorded (record mode) or served from recordings (replay mode).
   *
   * Required to capture postgres.js in apps whose bundler inlines it — a Vite SSR graph
   * (React Router, TanStack Start), Next.js / Turbopack and similar — because `postgres` then
   * never passes through Node's module loader and the recorder's require-hook instrumentation
   * can never fire. The only seam is the app's own code, so wrap the instance where you
   * construct it.
   *
   * Every postgres.js query funnels through one internal method, so the wrapper instruments
   * that rather than the instance: one call therefore also covers read-replica clients and any
   * other client in the process. The instrumentation dispatches at query time, so it is safe to
   * apply at module-load time; when the recorder is disabled or uninitialised it passes through
   * (no-op).
   *
   * Apply it outermost if other instrumentation also wraps the client (e.g. Sentry's
   * `instrumentPostgresJsSql`).
   *
   * Optional so older recorder bundles (which predate this field) still satisfy the type;
   * guard with `handle?.withMeticulousPostgres`.
   */
  withMeticulousPostgres?: MeticulousPostgresJsWrapper;

  /**
   * The Meticulous generic operation wrapper — the seam for anything the recorder cannot
   * instrument on its own. Wrap the call in your own code
   * (`const user = await handle.withMeticulousOperation({ name, key }, () => sdk.getUser(id))`)
   * so it is recorded (record mode) or served from the recording (replay mode).
   *
   * Reach for it in two situations. The first is a client library Meticulous has no
   * instrumentation for — a gRPC stub, a vendor SDK over its own transport — which is
   * otherwise invisible to a recording and unreachable during a replay. The second, and often
   * the better choice even for a supported transport, is an operation that sits *above* it:
   * wrapping the function that reads a cache and falls back to an API records the semantic
   * operation, so it replays whether or not the recorded run happened to hit the cache.
   * Instrument the transport alone and a run served from a warm cache records nothing at all.
   *
   * The wrapper has to own the invocation, because that is what lets replay skip it: in
   * replay mode your function is never called, and the recorded result is returned (or the
   * recorded error thrown) in its place. It dispatches per call, so it is safe to apply at
   * module-load time; when the recorder is disabled or uninitialised it simply calls your
   * function.
   *
   * The operation's key and result are stored as JSON, so both must be JSON-serializable —
   * a `Date` comes back as a string, a `Map` as `{}`. The recorder logs a warning naming the
   * offending field when it sees one during recording.
   *
   * Optional so older recorder bundles (which predate this field) still satisfy the type;
   * guard with `handle?.withMeticulousOperation`.
   */
  withMeticulousOperation?: MeticulousOperationWrapper;

  /**
   * Records a value into the session without stubbing anything — app state a replay should be
   * able to account for (resolved feature flags, a chosen experiment arm) that no call
   * produces, so nothing else captures it.
   *
   * Recorded in record mode and ignored in replay, where there is nothing to serve and nothing
   * to suppress. It never throws and never changes control flow, so it is safe on any path.
   *
   * Optional so older recorder bundles (which predate this field) still satisfy the type;
   * guard with `handle?.recordMeticulousObservation`.
   */
  recordMeticulousObservation?: MeticulousObservationRecorder;

  /**
   * The same capture as {@link withMeticulousOperation}, split into the two halves the app
   * calls itself, for a team unwilling to hand us the invocation of their own code. Recordings
   * interoperate with the wrapper's; the name is the whole identity, so put whatever
   * distinguishes one call from another into it.
   *
   * The wrapper is still the better default where it is acceptable: it has one path so it
   * cannot be branched wrongly, and it captures a thrown error, which the split API cannot see.
   *
   * Optional so older recorder bundles (which predate these fields) still satisfy the type;
   * guard with `handle?.isMeticulousReplaying`.
   */
  isMeticulousReplaying?: MeticulousReplayCheck;
  /** See {@link isMeticulousReplaying}. Optional for the same reason. */
  stubWithMeticulous?: MeticulousStubReader;
  /** See {@link isMeticulousReplaying}. Optional for the same reason. */
  recordWithMeticulous?: MeticulousValueRecorder;
}
