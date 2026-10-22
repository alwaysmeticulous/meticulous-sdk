import type { AgentTraceAgent } from "./constants";
import type { AgentTraceSummary } from "./summary.types";

/** Body of `POST /api/agent-traces/request-upload`. */
export interface RequestAgentTraceUploadRequest {
  agent: AgentTraceAgent;
  sessionId: string;
  atifSizeBytes: number;
  rawSizeBytes: number;
  /**
   * Lets the server answer `already-uploaded` when the session's latest
   * upload has the same content. Omit to always upload.
   */
  contentSha256?: string;
}

export type RequestAgentTraceUploadResponse =
  | AgentTraceUploadRequired
  | AgentTraceAlreadyUploaded;

export interface AgentTraceUploadRequired {
  status: "upload-required";
  uploadId: string;
  /** Presigned PUT for the gzipped ATIF trajectory. */
  atifUploadUrl: string;
  /** Presigned PUT for the gzipped raw envelope. */
  rawUploadUrl: string;
}

export interface AgentTraceAlreadyUploaded {
  status: "already-uploaded";
  agentTraceId: string;
}

/** Body of `POST /api/agent-traces/complete-upload`. */
export interface CompleteAgentTraceUploadRequest {
  agent: AgentTraceAgent;
  sessionId: string;
  uploadId: string;
  /**
   * SHA-256 of the raw transcript files' paths and contents, as computed by
   * the uploader. Absent from older uploaders.
   */
  contentSha256?: string;
  summary: AgentTraceSummary;
}

export interface CompleteAgentTraceUploadResponse {
  agentTraceId: string;
}
