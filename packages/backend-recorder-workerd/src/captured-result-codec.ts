/**
 * JSON codec for the results a database client hands back, used by the Prisma, pg and
 * postgres.js capture paths on BOTH sides so a replayed result carries the same JS types
 * the driver produced at record time.
 *
 * Plain `JSON.stringify` loses those types silently. Every one of these clients returns a
 * `Date` for a timestamp column; it becomes an ISO string in the recording, and the app's
 * `row.createdAt.toISOString()` then throws during replay — while the mock is reported as a
 * clean hit, because the store did find the right recording. A `BigInt` is worse: stringify
 * throws, the record side catches, and the operation is never captured at all.
 *
 * So a value JSON cannot represent is replaced by a tagged wrapper
 * (`{ __meticulousType, value }`) and rebuilt on the way out, and the payload is wrapped once
 * more in an envelope carrying the encoding version. That envelope is also what marks a
 * recording as one this codec wrote: a recording made before it has none, and its timestamps
 * are recovered by shape instead — see {@link reviveLegacyTimestamps}.
 *
 * Lives here rather than in `backend-recorder-js` because a deployed Cloudflare Worker records
 * postgres.js and loses the same types, and a Worker cannot load that package — so the dependency
 * runs this way round, as it already does for `serializeCapturedError` and `serializeKvCaptureFields`.
 * Nothing loads this package at runtime on the Node path: it is bundled into the recorder the
 * launcher fetches.
 *
 * Still unhandled: a `Prisma.Decimal` (`decimal.js`) replays as the string its `toJSON` produced,
 * because rebuilding one needs the class and replay has no `@prisma/client` to reach it through.
 */

const ENCODING_VERSION = 1;
const ENVELOPE_VERSION_KEY = "__meticulousEncoding";
const TYPE_TAG_KEY = "__meticulousType";
// Both the envelope and a tag carry their payload under this key.
const VALUE_KEY = "value";

type TypeTag = "Date" | "BigInt" | "Binary" | "NonFiniteNumber";

interface TaggedValue {
  [TYPE_TAG_KEY]: TypeTag;
  [VALUE_KEY]: string | null;
}

/**
 * Serializes a captured result to a JSON string, preserving the types JSON has no
 * representation for. Throws on a cyclic value, exactly as `JSON.stringify` does — the record
 * side catches that and captures nothing.
 */
export const serializeCapturedResult = (result: unknown): string =>
  JSON.stringify(
    { [ENVELOPE_VERSION_KEY]: ENCODING_VERSION, [VALUE_KEY]: result },
    tagUnrepresentableValues,
  );

/**
 * Reconstructs a captured result, rebuilding the tagged values as the types they were
 * recorded from. A payload without the version envelope was written before this codec
 * existed, and falls back to recovering timestamps by shape.
 */
export const deserializeCapturedResult = (json: string): unknown => {
  const parsed: unknown = JSON.parse(json, rebuildTaggedValue);
  if (isEncodedEnvelope(parsed)) {
    return parsed[VALUE_KEY];
  }
  return reviveLegacyTimestamps(parsed);
};

/**
 * `JSON.stringify` replacer. It has to be a `function` rather than an arrow: `value` has
 * already been through the holder's `toJSON()` by the time a replacer sees it (a `Date`
 * arrives as a string, a `Buffer` as `{ type, data }`), so the only way to see what the
 * driver actually returned is `this[key]` on the bound holder.
 */
function tagUnrepresentableValues(this: unknown, key: string, value: unknown) {
  const raw = (this as Record<string, unknown>)[key];
  if (typeof raw === "bigint") {
    return tagged("BigInt", raw.toString());
  }
  if (typeof raw === "number" && !Number.isFinite(raw)) {
    return tagged("NonFiniteNumber", String(raw));
  }
  if (raw instanceof Date) {
    return tagged(
      "Date",
      Number.isNaN(raw.getTime()) ? null : raw.toISOString(),
    );
  }
  // A DataView is left alone: no driver returns one, and it would come back a Uint8Array.
  if (ArrayBuffer.isView(raw) && !(raw instanceof DataView)) {
    return tagged("Binary", toBase64(raw));
  }
  if (raw instanceof ArrayBuffer) {
    return tagged("Binary", toBase64(new Uint8Array(raw)));
  }
  return value;
}

const tagged = (type: TypeTag, value: string | null): TaggedValue => ({
  [TYPE_TAG_KEY]: type,
  [VALUE_KEY]: value,
});

/**
 * `JSON.parse` reviver. A tag is only honoured when its payload is one this codec could have
 * written, so an app value that happens to be shaped like a tag — and a tag type a later
 * recorder introduced — is passed through untouched rather than decoded into something else.
 * (The shim has no runtime dependencies, so `assertNever` is not available for the switch.)
 */
const rebuildTaggedValue = (_key: string, value: unknown): unknown => {
  if (!isTaggedValue(value)) {
    return value;
  }
  const encoded = value[VALUE_KEY];
  switch (value[TYPE_TAG_KEY]) {
    case "Date":
      return decodeDate(encoded) ?? value;
    case "BigInt":
      return typeof encoded === "string" && INTEGER.test(encoded)
        ? BigInt(encoded)
        : value;
    case "NonFiniteNumber":
      return typeof encoded === "string" && NON_FINITE_NUMBERS.has(encoded)
        ? Number(encoded)
        : value;
    case "Binary":
      return typeof encoded === "string" && BASE64.test(encoded)
        ? fromBase64(encoded)
        : value;
  }
};

const INTEGER = /^-?\d+$/;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const NON_FINITE_NUMBERS: ReadonlySet<string> = new Set([
  "NaN",
  "Infinity",
  "-Infinity",
]);

// `null` is how an invalid Date was recorded; anything else has to be the exact string
// `toISOString` would have produced for it.
const decodeDate = (encoded: string | null): Date | undefined => {
  if (encoded == null) {
    return new Date(NaN);
  }
  const date = new Date(encoded);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== encoded) {
    return undefined;
  }
  return date;
};

const TYPE_TAGS: ReadonlySet<string> = new Set<TypeTag>([
  "Date",
  "BigInt",
  "Binary",
  "NonFiniteNumber",
]);

const isTaggedValue = (value: unknown): value is TaggedValue => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes(VALUE_KEY)) {
    return false;
  }
  const tag = (value as Record<string, unknown>)[TYPE_TAG_KEY];
  const encoded = (value as Record<string, unknown>)[VALUE_KEY];
  return (
    typeof tag === "string" &&
    TYPE_TAGS.has(tag) &&
    (typeof encoded === "string" || encoded === null)
  );
};

const isEncodedEnvelope = (
  value: unknown,
): value is Record<string, unknown> => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    (value as Record<string, unknown>)[ENVELOPE_VERSION_KEY] ===
    ENCODING_VERSION
  );
};

/**
 * The compatibility path for every recording made before this codec: the driver's `Date`s
 * are already flattened to strings there, and nothing in the payload says which strings they
 * were. Recovering them by shape is a guess, but a tightly bounded one — only the exact
 * 24-character form `Date.prototype.toJSON` emits, and only when it round-trips back to
 * itself, so a string column can collide with it solely by holding a real UTC millisecond
 * timestamp. Left as a guess rather than declined outright because the alternative is every
 * date-formatting call in the app throwing.
 *
 * Mutates in place: the value has just come out of `JSON.parse` and is owned by the caller.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const reviveLegacyTimestamps = (value: unknown): unknown => {
  if (typeof value === "string") {
    return asLegacyTimestamp(value) ?? value;
  }
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = reviveLegacyTimestamps(value[i]);
    }
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    record[key] = reviveLegacyTimestamps(record[key]);
  }
  return record;
};

const asLegacyTimestamp = (value: string): Date | undefined =>
  ISO_TIMESTAMP.test(value) ? decodeDate(value) : undefined;

const BASE64_CHUNK_SIZE = 0x8000;

const toBase64 = (view: ArrayBufferView): string => {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
};

// Replay only ever runs on Node, so a `Buffer` is both what pg returned at record time and a
// `Uint8Array` as far as a Prisma `Bytes` consumer is concerned.
const fromBase64 = (base64: string): Uint8Array => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
