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
}
