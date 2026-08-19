import { warnOnce } from "./log";
import { hasWebSocket } from "./outbound-capture";
import { WORKERD_SHIM_VERSION_HEADER } from "./protocol";
import { WORKERD_SHIM_VERSION } from "./version";

/**
 * Stamps this shim's npm package version on the response the browser is about
 * to receive, so the replay runner can tell which bundled shim produced the
 * After screenshots.
 *
 * Returns the response to send, which is not always the one passed in: a
 * `Response` handed back by `fetch` or by an assets binding has immutable
 * headers, and the only way to add one is to rebuild around the same body.
 * Best-effort throughout — a recorder must never break the customer's app.
 */
export const publishWorkerdShimVersionOnResponse = (
  response: Response,
): Response => {
  try {
    response.headers.set(WORKERD_SHIM_VERSION_HEADER, WORKERD_SHIM_VERSION);
    return response;
  } catch {
    // Immutable headers. Fall through and rebuild.
  }

  try {
    // A WebSocket upgrade carries the socket rather than a body and cannot
    // survive being rebuilt.
    if (hasWebSocket(response) || response.status === 101) {
      return response;
    }
    const rebuilt = new Response(response.body, response);
    rebuilt.headers.set(WORKERD_SHIM_VERSION_HEADER, WORKERD_SHIM_VERSION);
    return rebuilt;
  } catch (error) {
    warnOnce(
      "publish-shim-version",
      "Failed to publish the workerd shim version on the response.",
      error,
    );
    return response;
  }
};
