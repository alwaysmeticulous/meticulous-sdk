/** Replacement for a redacted value. Matches the Node recorder's redaction marker. */
export const STR_REDACTED = "REDACTED";

/**
 * Object keys whose values are replaced before a captured request body leaves the worker.
 *
 * Request bodies are captured verbatim, and plenty of APIs carry a credential in the body
 * rather than a header — an OAuth2 token exchange, or a feature-flag resolver that takes its
 * client secret as a JSON field. Header redaction (an allow-list of two) does nothing for
 * those, so without this the credential would be persisted in the recorded span.
 *
 * Compared case-insensitively, ignoring `_` and `-`, so `clientSecret`, `client_secret` and
 * `CLIENT-SECRET` all match one entry.
 */
const SECRET_KEYS = [
  "accesstoken",
  "apikey",
  "authorization",
  "clientsecret",
  "credential",
  "idtoken",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "token",
] as const;

const secretKeys = new Set<string>(SECRET_KEYS);

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[_-]/g, "");

const isSecretKey = (key: string): boolean => secretKeys.has(normalizeKey(key));

/**
 * Redacts secret-looking fields from a captured request body, returning the body unchanged
 * if it is not JSON.
 *
 * Applied to request bodies only. Response bodies must stay byte-exact: replay serves them
 * back to the app, so redacting one would corrupt what the app receives. Request bodies are
 * only ever used to key a lookup, and because the same function runs on both the record and
 * the replay side the keys still agree.
 *
 * Never throws — a body that cannot be parsed or re-serialized is returned as-is, which is
 * no worse than today's behaviour.
 */
export const redactRequestBody = (body: string): string => {
  if (body.length === 0) {
    return body;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    const redacted = redactValue(parsed);
    const serialized = JSON.stringify(redacted);
    return serialized ?? body;
  } catch {
    // Not JSON (form-encoded, protobuf, plain text) — left alone rather than mangled.
    return body;
  }
};

const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = isSecretKey(key) ? STR_REDACTED : redactValue(nested);
  }
  return result;
};
