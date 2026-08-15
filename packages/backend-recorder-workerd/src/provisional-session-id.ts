import { FRONTEND_SESSION_ID_HEADER } from "./protocol";

/**
 * A session id the *backend* mints, for the one request that can never carry one from the
 * browser: a top-level document navigation. Browsers cannot add custom headers to a
 * navigation, and on the session-starting navigation the frontend has not minted an id yet
 * (it does so only once the HTML has arrived and the snippet has run) — so the server-side
 * render's spans are recorded against no session and nothing about that traffic can be
 * replayed exactly.
 *
 * Everything here is runtime-agnostic on purpose. Both backend recorders mint the same ids
 * by the same rule and publish them under the same `Server-Timing` metric, and all three are
 * wire contracts with the page, so there is exactly one implementation — the same reason
 * kv-capture.ts lives here rather than being written twice. The Node recorder imports these
 * from the package entry; see `provisional-session-id.ts` in
 * `@alwaysmeticulous/backend-recorder-js` for the `http.IncomingMessage` adapter, and
 * `publish-session-id.ts` next door for the workerd one.
 */

/**
 * Reads one request header by its lower-cased name. Both `IncomingMessage.headers[name]`
 * (after the caller flattens Node's `string | string[]`) and `Headers.get(name)` satisfy it,
 * which is what lets the rules below be shared.
 */
export type HeaderReader = (name: string) => string | null | undefined;

export const SERVER_TIMING_HEADER = "server-timing";

/**
 * The `Server-Timing` metric name carrying a backend-minted session id to the page. A wire
 * contract with the frontend recorder, which matches on it case-insensitively when reading
 * `PerformanceNavigationTiming.serverTiming` (see `resolve-session-id.ts` in
 * packages/recorder). Must be a valid HTTP token — no `.` or `:`, which is why it is not the
 * dotted span-attribute name.
 */
export const SERVER_TIMING_SESSION_METRIC = "metsession";

/**
 * `Server-Timing` is the one response header a document's own JavaScript can read back, and
 * the navigation entry persists for the document's lifetime — so unlike a header-sniffing
 * approach this works no matter how late the snippet loads.
 */
export const buildServerTimingSessionEntry = (sessionId: string): string =>
  `${SERVER_TIMING_SESSION_METRIC};desc="${sessionId}"`;

/**
 * nanoid's default alphabet and length, reproduced rather than imported: this package carries
 * no runtime dependencies, and an id that did not look like every other session id would be a
 * gratuitous difference in S3 keys and URLs. 64 characters divides 256 exactly, so masking a
 * random byte with 63 is uniform — which is how nanoid itself generates them.
 */
const ID_ALPHABET =
  "ModuleSymbhasOwnPr-0123456789ABCDEFGHNRVfgctiUvz_KqYTJkLxpZXIjQW";
const ID_LENGTH = 21;

/**
 * Mints an id in exactly the frontend recorder's format: `<ISO timestamp>_<nanoid>` (see
 * `createConfig` in packages/recorder). The format is a wire contract, not cosmetic —
 * ingestion parses the ISO prefix back out to anchor the inferred-attachment window
 * (`parseTimestampFromFrontendSessionId` in lambda-upload-sessions), and the page uses it to
 * reject an id stale enough to have come from a cache.
 */
export const mintProvisionalSessionId = (): string => {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) {
    suffix += ID_ALPHABET[byte & 63];
  }
  return `${new Date().toISOString()}_${suffix}`;
};

/**
 * Whether to mint for this inbound request. Deliberately narrow: an id nothing adopts is
 * worse than no id at all, because a span stamped with a session that never materialises is
 * excluded from the time-window fallback that would otherwise have caught it. So we mint only
 * for what is plausibly a browser navigating to a page.
 *
 * The caller decides separately whether minting is enabled at all.
 */
export const isProvisionalSessionIdCandidate = (
  method: string,
  getHeader: HeaderReader,
): boolean => {
  // A request that already names its session needs nothing from us.
  if (getHeader(FRONTEND_SESSION_ID_HEADER) != null) {
    return false;
  }
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return false;
  }
  return isDocumentNavigation(getHeader);
};

/**
 * `Sec-Fetch-Dest` is the exact signal and every current browser sends it: `document` for a
 * navigation, `empty` for an in-page fetch (so a Next.js RSC navigation, which is a fetch, is
 * correctly excluded), `iframe` for a subframe — excluded too, since the top frame owns the
 * session and an iframe recorder reports into it.
 *
 * Absent, the caller is an older browser or not a browser at all (curl, a health check, a
 * crawler), and `Accept` is the only hint left.
 */
const isDocumentNavigation = (getHeader: HeaderReader): boolean => {
  const dest = getHeader("sec-fetch-dest");
  if (typeof dest === "string") {
    return dest === "document";
  }
  const accept = getHeader("accept");
  return typeof accept === "string" && accept.includes("text/html");
};
