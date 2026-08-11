import { MAX_BODY_CAPTURE_SIZE } from "./body-capture";
import type { CapturedBody, KvOmittedReason, KvOperation } from "./protocol";
import { redactRequestBody } from "./redact-body";

/**
 * How a KV operation's key, arguments and value are turned into persistable fields.
 *
 * This lives apart from `kv-patch.ts` because it is not workerd-specific: the same operations
 * are recorded from a **Node** process whose bindings come from wrangler's `getPlatformProxy`
 * (`withMeticulousCloudflareEnv` in `@alwaysmeticulous/backend-recorder-js`), and the two
 * surfaces have to produce byte-identical fields or a session recorded through one cannot be
 * replayed through the other. So the contract is defined once, here, and both call it.
 */

interface SerializedKvValue {
  captured?: CapturedBody;
  omitted?: KvOmittedReason;
}

/** The outcome of a KV operation: what it returned, or how it failed. */
export type KvCaptureOutcome = { result: unknown } | { error: string };

/** The persistable fields of one KV operation, as `KvOperationEvent` carries them. */
export interface KvCaptureFields {
  /** The key operated on, when it is a single string. Absent for `list` and a bulk `get`. */
  key?: string;
  /** JSON of the call's arguments, with a `put`'s value slot nulled out. */
  args?: CapturedBody;
  /** JSON of the value a `put` wrote, redacted. */
  value?: CapturedBody;
  /** JSON of what the operation returned. Absent for `put`/`delete` and for an error. */
  result?: CapturedBody;
  /** Why a value is missing. Refers to the written value for `put`, the read value otherwise. */
  omitted?: KvOmittedReason;
}

/**
 * Serializes one KV operation's fields. Never throws: a value that cannot be serialized is
 * simply absent, so the operation is still recorded and only its payload is missing.
 */
export const serializeKvCaptureFields = (
  operation: KvOperation,
  args: unknown[],
  outcome: KvCaptureOutcome,
): KvCaptureFields => {
  const [key] = args;
  const written =
    operation === "put" ? serializeWrittenValue(args[1]) : undefined;
  const read =
    "result" in outcome ? serializeKvValue(outcome.result) : undefined;
  const omitted = written?.omitted ?? read?.omitted;
  const serializedArgs = serializeKvArgs(operation, args);

  return {
    ...(typeof key === "string" ? { key } : {}),
    ...(serializedArgs !== undefined ? { args: serializedArgs } : {}),
    ...(written?.captured !== undefined ? { value: written.captured } : {}),
    ...(read?.captured !== undefined ? { result: read.captured } : {}),
    ...(omitted !== undefined ? { omitted } : {}),
  };
};

/**
 * JSON of a value the runtime returned, with anything unpersistable replaced by `null` and the
 * reason reported alongside. A `Map` (what a bulk `get` returns) becomes a plain object, which
 * `JSON.stringify` would otherwise flatten to `{}`.
 *
 * Read values are stored verbatim, deliberately: replay serves them straight back to the app,
 * so redacting one would corrupt what the app receives. Only the write path
 * ({@link serializeWrittenValue}) is redacted — nothing ever replays a `put`.
 */
const serializeKvValue = (value: unknown): SerializedKvValue => {
  let omitted: KvOmittedReason | undefined;
  try {
    const json = JSON.stringify(value, (_key: string, nested: unknown) => {
      const reason = omittedReason(nested);
      if (reason !== undefined) {
        omitted ??= reason;
        return null;
      }
      return nested instanceof Map
        ? Object.fromEntries(nested as Map<string, unknown>)
        : nested;
    });
    return {
      // `undefined` (what `put`/`delete` resolve to) has no JSON form — nothing to capture.
      ...(json !== undefined ? { captured: capture(json) } : {}),
      ...(omitted !== undefined ? { omitted } : {}),
    };
  } catch {
    // Circular, or a getter that throws. The operation itself is still recorded.
    return {};
  }
};

/**
 * JSON of the value a `put` wrote, redacted like a request body. KV takes a string, an
 * ArrayBuffer(View) or a stream; only the string form can be captured, and it is redacted as
 * text before being JSON-encoded so that secret-looking fields *inside* the app's payload are
 * caught (redacting the JSON-encoded form would only ever see one opaque string).
 */
const serializeWrittenValue = (value: unknown): SerializedKvValue => {
  if (typeof value === "string") {
    try {
      return { captured: capture(JSON.stringify(redactRequestBody(value))) };
    } catch {
      return {};
    }
  }
  return serializeKvValue(value);
};

/**
 * JSON of the call's arguments. A `put` value is replaced by `null` rather than dropped, so the
 * remaining arguments keep their positions — and so the value is only ever persisted via the
 * redacted {@link serializeWrittenValue} path.
 *
 * Exported because it is a KV operation's whole identity: a replay derives its lookup key from the
 * live arguments and compares it against this, so the two must be produced by one function.
 */
export const serializeKvArgs = (
  operation: KvOperation,
  args: unknown[],
): CapturedBody | undefined => {
  const withoutValue =
    operation === "put"
      ? args.map((arg, index) => (index === 1 ? null : arg))
      : args;
  return serializeKvValue(withoutValue).captured;
};

const omittedReason = (value: unknown): KvOmittedReason | undefined => {
  // A stream is never read, only recognised: reading it would consume the app's bytes.
  if (
    typeof ReadableStream !== "undefined" &&
    value instanceof ReadableStream
  ) {
    return "stream";
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return "binary";
  }
  return undefined;
};

const capture = (json: string): CapturedBody =>
  json.length > MAX_BODY_CAPTURE_SIZE
    ? { body: json.slice(0, MAX_BODY_CAPTURE_SIZE), truncated: true }
    : { body: json, truncated: false };
