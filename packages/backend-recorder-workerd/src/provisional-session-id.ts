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
 * Whether to mint for this inbound request. Narrow on purpose — only what is plausibly a
 * browser loading a page, so an API response never carries an id no document could adopt.
 * Narrowness is a matter of not publishing noise rather than of avoiding harm: ingestion
 * treats a backend-origin id that no session adopted as unstamped
 * (`hasDisqualifyingSessionId`), so an unadopted mint is a no-op, not a regression.
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
 * top-level navigation, `iframe`/`frame` for a subframe one, and `empty` for an in-page fetch
 * (so a Next.js RSC navigation, which is a fetch, is correctly excluded).
 *
 * A subframe navigation qualifies because a subframe does not reliably fold into the top
 * frame's session. The frontend recorder forwards a subframe's payload to the top frame and
 * skips its own upload only when the top frame answers with a matching recording-token prefix
 * (`tryForwardToTopFrame` in packages/recorder); where it does not — a cross-origin frame whose
 * parent runs no recorder — that frame records a session of its own, and the SSR render behind
 * it is precisely what minting exists to attribute. And even when the subframe does defer, the
 * forwarding carries frontend data only: backend spans are attributed by the id stamped here,
 * so without a mint that render is attributable to nobody either way.
 *
 * Nothing in the request distinguishes the two, and the server cannot know: the deciding
 * handshake happens in the browser, after this response. Minting for both is what makes the
 * owning case work and costs nothing in the deferring case, where the id is simply never
 * adopted (see the note above).
 *
 * Absent, the caller is an older browser or not a browser at all (curl, a health check, a
 * crawler), and `Accept` is the only hint left.
 */
const isDocumentNavigation = (getHeader: HeaderReader): boolean => {
  const dest = getHeader("sec-fetch-dest");
  if (typeof dest === "string") {
    return dest === "document" || dest === "iframe" || dest === "frame";
  }
  const accept = getHeader("accept");
  return typeof accept === "string" && accept.includes("text/html");
};
