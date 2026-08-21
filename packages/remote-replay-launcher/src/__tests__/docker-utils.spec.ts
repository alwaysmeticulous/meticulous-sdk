import type * as Common from "@alwaysmeticulous/common";
import Docker from "dockerode";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushImage } from "../docker-utils";

const DIGEST = `sha256:${"a".repeat(64)}`;
const IMAGE_REFERENCE = "registry.example.com/project/app:upload-1";
const AUTH_CONFIG = {
  username: "robot",
  password: "secret",
  serveraddress: "registry.example.com",
};

vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  initLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("pushImage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accepts an aux manifest digest from a real Docker progress stream", async () => {
    const { docker, push } = buildDockerWithPushAttempts([
      [{ status: "Pushed", aux: { Digest: DIGEST } }],
    ]);

    await expect(
      pushImage(docker, IMAGE_REFERENCE, AUTH_CONFIG),
    ).resolves.toBeUndefined();
    expect(push).toHaveBeenCalledOnce();
  });

  it("retries an in-stream daemon error even when the stream ends cleanly", async () => {
    vi.useFakeTimers();
    const { docker, push } = buildDockerWithPushAttempts([
      [
        {
          error: "blob unknown to registry",
          errorDetail: { message: "blob unknown to registry" },
        },
      ],
      [{ status: `upload-1: digest: ${DIGEST} size: 1234` }],
    ]);

    const result = pushImage(docker, IMAGE_REFERENCE, AUTH_CONFIG);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("rejects a clean stream that never publishes a manifest", async () => {
    vi.useFakeTimers();
    const { docker, push } = buildDockerWithPushAttempts([
      [{ id: "layer-1", status: "Pushed" }],
      [{ id: "layer-1", status: "Pushed" }],
      [{ id: "layer-1", status: "Pushed" }],
    ]);

    const result = pushImage(docker, IMAGE_REFERENCE, AUTH_CONFIG);
    const rejection = expect(result).rejects.toThrow(
      "before the registry confirmed a manifest digest",
    );
    await vi.runAllTimersAsync();

    await rejection;
    expect(push).toHaveBeenCalledTimes(3);
  });
});

const buildDockerWithPushAttempts = (
  attempts: Array<Array<Record<string, unknown>>>,
): { docker: Docker; push: ReturnType<typeof vi.fn> } => {
  const docker = new Docker();
  const remainingAttempts = [...attempts];
  const push = vi.fn(
    (
      _options: unknown,
      callback: (error: Error | null, stream: NodeJS.ReadableStream) => void,
    ) => {
      const events = remainingAttempts.shift();
      if (!events) {
        callback(new Error("Unexpected extra push attempt"), Readable.from([]));
        return;
      }
      callback(
        null,
        Readable.from(events.map((event) => `${JSON.stringify(event)}\n`)),
      );
    },
  );
  vi.spyOn(docker, "getImage").mockReturnValue({
    push,
  } as unknown as Docker.Image);
  return { docker, push };
};
