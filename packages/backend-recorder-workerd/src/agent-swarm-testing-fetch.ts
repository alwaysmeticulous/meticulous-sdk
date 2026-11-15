import { readRequestBodyWithCap } from "./body-capture";
import type { RequestAgentSwarmTestingContext } from "./context";
import { getOriginalFetch } from "./original-fetch";
import {
  type AgentSwarmTestingPassthroughResult,
  type OutboundFetchAgentSwarmTestingRequest,
  type OutboundFetchAgentSwarmTestingResponse,
} from "./protocol";
import {
  postAgentSwarmTestingOutboundFetch,
  postAgentSwarmTestingPassthroughResult,
} from "./sidecar-client";
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
    const requestHeaders: Record<string, string> = {};
    for (const [name, value] of request.headers) {
      requestHeaders[name] = value;
    }
    const payload: OutboundFetchAgentSwarmTestingRequest = {
      runId: ctx.runId,
      ...(ctx.frontendSessionId !== undefined
        ? { frontendSessionId: ctx.frontendSessionId }
        : {}),
      method: request.method,
      url: request.url,
      ...(requestBody !== undefined ? { requestBody } : {}),
      ...(Object.keys(requestHeaders).length > 0 ? { requestHeaders } : {}),
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

  const callId = result?.outcome === "passthrough" ? result.callId : undefined;
  if (callId === undefined) {
    return invoke(request);
  }
  return invokeAndReport(ctx, callId, () => invoke(request));
};

/**
 * Passes the call through and tells the interceptor how it ended, so a call the real service
 * refused or failed is visible to the agent rather than "not observed". The report runs under
 * `waitUntil`; the app gets the call's own response or error unchanged.
 */
const invokeAndReport = async (
  ctx: RequestAgentSwarmTestingContext,
  callId: string,
  send: () => Promise<Response>,
): Promise<Response> => {
  const report = (result: AgentSwarmTestingPassthroughResult): void => {
    ctx.waitUntil(
      postAgentSwarmTestingPassthroughResult(
        getOriginalFetch(),
        ctx.sidecarUrl,
        {
          runId: ctx.runId,
          ...(ctx.frontendSessionId !== undefined
            ? { frontendSessionId: ctx.frontendSessionId }
            : {}),
          callId,
          result,
        },
      ),
    );
  };
  let response: Response;
  try {
    response = await send();
  } catch (error) {
    report({ error: describeCallError(error) });
    throw error;
  }
  report({ statusCode: response.status });
  return response;
};

/**
 * A failed call's message with its cause: a fetch failure often says only
 * "fetch failed", while the cause names the refused host and port.
 */
const describeCallError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause == null) {
    return message;
  }
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  return causeMessage === "" || causeMessage === message
    ? message
    : `${message} (cause: ${causeMessage})`;
};
