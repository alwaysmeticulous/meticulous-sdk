import { readRequestBodyWithCap } from "./body-capture";
import type { RequestAgentSwarmTestingContext } from "./context";
import { getOriginalFetch } from "./original-fetch";
import {
  type OutboundFetchAgentSwarmTestingRequest,
  type OutboundFetchAgentSwarmTestingResponse,
} from "./protocol";
import { postAgentSwarmTestingOutboundFetch } from "./sidecar-client";
import { buildMockResponse, hasPassthroughHeader } from "./replay-fetch";

/**
 * Offers one outbound call to the interceptor service, serving its response or passing the
 * call through to the real service.
 *
 * The deliberate opposite of replay's hermeticity: replay fails a call it cannot serve
 * because silently reaching the real service would turn a replay into live traffic, whereas
 * agent-swarm testing exists to be driven live — the interceptor is advisory, and any failure
 * to consult it (a miss, a timeout, an unparseable answer) means the call simply happens.
 */
export const agentSwarmTestingOutboundCall = async (
  ctx: RequestAgentSwarmTestingContext,
  request: Request,
  invoke: (request: Request) => Promise<Response>,
): Promise<Response> => {
  if (hasPassthroughHeader(request)) {
    return invoke(request);
  }

  let result: OutboundFetchAgentSwarmTestingResponse | undefined;
  try {
    // Read the clone and pass the original through untouched, mirroring the replay path.
    const requestBody = request.body
      ? await readRequestBodyWithCap(request.clone().body).catch(
          () => undefined,
        )
      : undefined;
    const payload: OutboundFetchAgentSwarmTestingRequest = {
      runId: ctx.runId,
      ...(ctx.frontendSessionId !== undefined
        ? { frontendSessionId: ctx.frontendSessionId }
        : {}),
      method: request.method,
      url: request.url,
      ...(requestBody !== undefined ? { requestBody } : {}),
    };
    result = await postAgentSwarmTestingOutboundFetch(
      getOriginalFetch(),
      ctx.sidecarUrl,
      payload,
    );
  } catch {
    result = undefined;
  }

  if (result !== undefined && result.outcome === "mock") {
    const mocked = buildMockResponse(result);
    if (mocked !== undefined) {
      return mocked;
    }
  }

  return invoke(request);
};
