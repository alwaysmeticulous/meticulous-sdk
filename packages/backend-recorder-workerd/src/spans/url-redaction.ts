import { STR_REDACTED } from "../redact-body";

/**
 * URL query keys that carry a credential rather than identify a resource.
 *
 * Mirrors `DEFAULT_QUERY_STRINGS_TO_REDACT` in the Node recorder's forked http
 * instrumentation. Both surfaces write URLs onto the same spans, so the two lists have to stay
 * identical or the same request records differently depending on where it was captured.
 */
const QUERY_STRINGS_TO_REDACT = [
  "sig",
  "Signature",
  "AWSAccessKeyId",
  "X-Goog-Signature",
] as const;

/**
 * Returns a copy of the URL with credential-bearing parts replaced: the signature-style query
 * parameters above, and any `user:password@` userinfo.
 *
 * Record side only. A replay lookup passes the live URL through unredacted, exactly as the
 * http, undici and sidecar lookup paths do, so a redacted parameter misses the exact tier and
 * is served by the drop-query tier instead — the right outcome, since a signature could not
 * have matched exactly across a record/replay boundary anyway.
 */
export const redactUrlCredentials = (url: URL): URL => {
  const redacted = new URL(url.href);
  for (const sensitiveParam of QUERY_STRINGS_TO_REDACT) {
    if (redacted.searchParams.get(sensitiveParam)) {
      redacted.searchParams.set(sensitiveParam, STR_REDACTED);
    }
  }
  if (redacted.username || redacted.password) {
    redacted.username = STR_REDACTED;
    redacted.password = STR_REDACTED;
  }
  return redacted;
};
