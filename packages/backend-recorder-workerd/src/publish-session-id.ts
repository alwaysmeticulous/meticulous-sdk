import { warnOnce } from "./log";
import { hasWebSocket } from "./outbound-capture";
import {
  SERVER_TIMING_HEADER,
  buildServerTimingSessionEntry,
} from "./provisional-session-id";

/**
 * Publishes a backend-minted session id to the page on the response it is about to receive,
 * so the frontend recorder adopts it instead of minting its own and the whole page load —
 * server-side render included — ends up under one session id.
 *
 * Returns the response to send, which is not always the one passed in: a `Response` handed
 * back by `fetch` or by an assets binding has immutable headers, and the only way to add one
 * is to rebuild around the same body. Best-effort throughout — a recorder must never break
 * the customer's app, so anything unexpected returns the original response unchanged.
 *
 * Unlike the Node recorder there is no `headersSent` race to lose: workerd flushes the
 * response only once the handler has returned it to us, so even a streaming SSR body still
 * has its headers in front of it at this point.
 */
export const publishSessionIdOnResponse = (
  response: Response,
  sessionId: string,
): Response => {
  const entry = buildServerTimingSessionEntry(sessionId);

  try {
    // Appends rather than replaces: apps publish their own server timings, and clobbering
    // them would be a visible regression in their tooling.
    response.headers.append(SERVER_TIMING_HEADER, entry);
    return response;
  } catch {
    // Immutable headers. Fall through and rebuild.
  }

  try {
    // A WebSocket upgrade carries the socket rather than a body and cannot survive being
    // rebuilt; it is never a document navigation either, so there is nothing to publish to.
    if (hasWebSocket(response) || response.status === 101) {
      return response;
    }
    const rebuilt = new Response(response.body, response);
    rebuilt.headers.append(SERVER_TIMING_HEADER, entry);
    return rebuilt;
  } catch (error) {
    warnOnce(
      "publish-session-id",
      "Failed to publish the backend-minted session id on the response.",
      error,
    );
    return response;
  }
};
