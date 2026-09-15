import { describe, expect, it, vi } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import { getReplayV3DownloadUrls } from "../replay.api";

describe("Chrome diagnostics download opt-in", () => {
  it.each([false, true])(
    "only requests diagnostics when opted in: %s",
    async (includeChromeDiagnostics) => {
      const get = vi.fn().mockResolvedValue({ data: null });
      const client = { get } as unknown as MeticulousClient;
      await getReplayV3DownloadUrls(
        client,
        "replay-1",
        includeChromeDiagnostics ? { includeChromeDiagnostics } : undefined,
      );
      expect(get).toHaveBeenCalledWith("replays/replay-1/download-urls", {
        params: includeChromeDiagnostics
          ? { includeChromeDiagnostics: "true" }
          : {},
      });
    },
  );
});
