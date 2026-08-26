import { FRONTEND_SESSION_ID_HEADER } from "./protocol";
import type { HeaderReader } from "./provisional-session-id";

/**
 * Well-known container health/readiness probe paths. A Kubernetes probe, a load balancer and
 * the replay orchestrator's own availability check all poll one of these for the lifetime of
 * the pod, at a fixed cadence and with no session identity, so recording them adds a steady
 * stream of unstamped spans that no replay can ever use.
 *
 * Kept to conventional names only. A path outside this set is the app's own endpoint until
 * proven otherwise, and dropping a real call is far worse than recording a probe: the call
 * then has no mock and fails hermetically on replay.
 */
const HEALTH_PROBE_PATHS = new Set([
  "/health",
  "/healthz",
  "/healthcheck",
  "/health-check",
  "/_health",
  "/api/health",
  "/api/healthz",
  "/readyz",
  "/livez",
  "/ping",
]);

/**
 * Whether this inbound request is a health probe whose spans are worth nothing to a replay.
 *
 * Deliberately narrow on two axes beyond the path:
 *
 * - **No session id.** A request the browser or an SSR fan-out made carries
 *   `x-meticulous-session-id`, and that is real app traffic however it is named — an app is
 *   free to expose `/api/health` as a page's data source. Only a request nothing can attribute
 *   is treated as a probe, so this can never drop a span that ingestion's session-id match
 *   would have kept; it only removes spans that reach a session through the time-window
 *   fallback (see "Inferred span attachment" in the Node recorder's README), which is exactly
 *   where a probe would otherwise land.
 * - **GET/HEAD only.** Every probe convention is a read. A POST to `/health` is the app's own
 *   endpoint.
 *
 * Suppressing the inbound span suppresses the whole subtree beneath it (the Node surface does
 * this with OTel's `suppressTracing`, the workerd surface by never entering the capture
 * context), so a probe that does reach a database or an upstream service contributes nothing
 * either. That subtree is the part that actually matters: an unstamped `SELECT 1` or an
 * upstream `GET /health` is a CLIENT span, and CLIENT spans are what the replay mock stores
 * serve.
 */
export const isHealthProbeRequest = (
  method: string,
  path: string | undefined,
  getHeader: HeaderReader,
): boolean => {
  if (getHeader(FRONTEND_SESSION_ID_HEADER) != null) {
    return false;
  }
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return false;
  }
  const normalizedPath = normalizeProbePath(path);
  return normalizedPath !== undefined && HEALTH_PROBE_PATHS.has(normalizedPath);
};

/**
 * Node hands us an origin-form target (`/health?deep=1`), workerd an absolute URL, so both
 * shapes have to reduce to the same pathname. A trailing slash is stripped because `/health/`
 * and `/health` are the same route to every framework that serves one.
 */
const normalizeProbePath = (path: string | undefined): string | undefined => {
  if (path === undefined || path === "") {
    return undefined;
  }
  const pathname = path.startsWith("/")
    ? path.split("?")[0].split("#")[0]
    : pathnameOf(path);
  if (pathname === undefined) {
    return undefined;
  }
  const lowercased = pathname.toLowerCase();
  return lowercased.length > 1 && lowercased.endsWith("/")
    ? lowercased.slice(0, -1)
    : lowercased;
};

const pathnameOf = (url: string): string | undefined => {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
};
