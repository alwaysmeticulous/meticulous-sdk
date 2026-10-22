import type { AgentTraceSummary } from "@alwaysmeticulous/agent-traces";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { putBufferToSignedUrl } from "../../utils/put-buffer-to-signed-url";
import { uploadAgentTrace } from "../upload-agent-trace";

vi.mock("../../utils/put-buffer-to-signed-url", () => ({
  putBufferToSignedUrl: vi.fn(),
}));

const post = vi.fn();
const client = { post } as unknown as MeticulousClient;
const summary = { stepCount: 1 } as AgentTraceSummary;
const options = {
  client,
  project: "acme/shop",
  agent: "claude-code" as const,
  sessionId: "s1",
  atifGzipped: Buffer.from("atif"),
  rawGzipped: Buffer.from("raw!!"),
  contentSha256: "abc",
  summary,
};

describe("uploadAgentTrace", () => {
  beforeEach(() => {
    post.mockReset();
    vi.mocked(putBufferToSignedUrl).mockReset().mockResolvedValue();
  });

  it("requests URLs, uploads both objects, then completes", async () => {
    post
      .mockResolvedValueOnce({
        data: {
          status: "upload-required",
          uploadId: "u1",
          atifUploadUrl: "https://s3/atif",
          rawUploadUrl: "https://s3/raw",
        },
      })
      .mockResolvedValueOnce({ data: { agentTraceId: "t1" } });

    expect(await uploadAgentTrace(options)).toEqual({
      agentTraceId: "t1",
      alreadyUploaded: false,
    });
    expect(post).toHaveBeenNthCalledWith(
      1,
      "agent-traces/request-upload",
      {
        agent: "claude-code",
        sessionId: "s1",
        atifSizeBytes: 4,
        rawSizeBytes: 5,
        contentSha256: "abc",
      },
      { params: { project: "acme/shop" } },
    );
    expect(vi.mocked(putBufferToSignedUrl).mock.calls).toEqual([
      [{ buffer: options.atifGzipped, signedUrl: "https://s3/atif" }],
      [{ buffer: options.rawGzipped, signedUrl: "https://s3/raw" }],
    ]);
    expect(post).toHaveBeenNthCalledWith(
      2,
      "agent-traces/complete-upload",
      {
        agent: "claude-code",
        sessionId: "s1",
        uploadId: "u1",
        contentSha256: "abc",
        summary,
      },
      { params: { project: "acme/shop" } },
    );
  });

  it("stops when the server already has the content", async () => {
    post.mockResolvedValueOnce({
      data: { status: "already-uploaded", agentTraceId: "t0" },
    });

    expect(await uploadAgentTrace({ ...options, project: undefined })).toEqual({
      agentTraceId: "t0",
      alreadyUploaded: true,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[2]).toBeUndefined();
    expect(putBufferToSignedUrl).not.toHaveBeenCalled();
  });

  it("leaves out the content hash when forced, so the server can't dedupe", async () => {
    post.mockResolvedValueOnce({
      data: { status: "already-uploaded", agentTraceId: "t0" },
    });

    await uploadAgentTrace({ ...options, force: true });

    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("contentSha256");
  });
});
