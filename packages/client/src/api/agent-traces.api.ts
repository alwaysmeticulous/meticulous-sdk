import type {
  CompleteAgentTraceUploadRequest,
  CompleteAgentTraceUploadResponse,
  RequestAgentTraceUploadRequest,
  RequestAgentTraceUploadResponse,
} from "@alwaysmeticulous/agent-traces";
import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

interface AgentTraceRequestOptions<T> {
  client: MeticulousClient;
  /**
   * The project (id, `org/name` or a unique name) whose organization the
   * trace belongs to, for a logged-in user. Ignored for project API tokens.
   */
  project?: string | undefined;
  request: T;
}

export const requestAgentTraceUpload = async ({
  client,
  project,
  request,
}: AgentTraceRequestOptions<RequestAgentTraceUploadRequest>): Promise<RequestAgentTraceUploadResponse> => {
  const { data } = await client
    .post<RequestAgentTraceUploadResponse>(
      "agent-traces/request-upload",
      request,
      project ? { params: { project } } : undefined,
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const completeAgentTraceUpload = async ({
  client,
  project,
  request,
}: AgentTraceRequestOptions<CompleteAgentTraceUploadRequest>): Promise<CompleteAgentTraceUploadResponse> => {
  const { data } = await client
    .post<CompleteAgentTraceUploadResponse>(
      "agent-traces/complete-upload",
      request,
      project ? { params: { project } } : undefined,
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
