import type {
  AgentTraceAgent,
  AgentTraceSummary,
} from "@alwaysmeticulous/agent-traces";
import type { MeticulousClient } from "../types/client.types";
import { putBufferToSignedUrl } from "../utils/put-buffer-to-signed-url";
import { retryTransientUploadErrors } from "../utils/retry-transient-upload-errors";
import {
  completeAgentTraceUpload,
  requestAgentTraceUpload,
} from "./agent-traces.api";

export interface UploadAgentTraceOptions {
  client: MeticulousClient;
  project?: string | undefined;
  agent: AgentTraceAgent;
  sessionId: string;
  atifGzipped: Buffer;
  rawGzipped: Buffer;
  contentSha256: string;
  summary: AgentTraceSummary;
  /** Uploads even if the server already has this exact content. */
  force?: boolean;
}

export interface UploadAgentTraceResult {
  agentTraceId: string;
  alreadyUploaded: boolean;
}

/**
 * request-upload → PUT both objects → complete-upload, unless request-upload
 * reports the server already has this content.
 */
export const uploadAgentTrace = async ({
  client,
  project,
  agent,
  sessionId,
  atifGzipped,
  rawGzipped,
  contentSha256,
  summary,
  force = false,
}: UploadAgentTraceOptions): Promise<UploadAgentTraceResult> => {
  const response = await requestAgentTraceUpload({
    client,
    project,
    request: {
      agent,
      sessionId,
      atifSizeBytes: atifGzipped.length,
      rawSizeBytes: rawGzipped.length,
      ...(force ? {} : { contentSha256 }),
    },
  });
  if (response.status === "already-uploaded") {
    return { agentTraceId: response.agentTraceId, alreadyUploaded: true };
  }
  await Promise.all(
    [
      { buffer: atifGzipped, signedUrl: response.atifUploadUrl },
      { buffer: rawGzipped, signedUrl: response.rawUploadUrl },
    ].map((upload) =>
      retryTransientUploadErrors(() => putBufferToSignedUrl(upload)),
    ),
  );
  const { agentTraceId } = await completeAgentTraceUpload({
    client,
    project,
    request: {
      agent,
      sessionId,
      uploadId: response.uploadId,
      contentSha256,
      summary,
    },
  });
  return { agentTraceId, alreadyUploaded: false };
};
