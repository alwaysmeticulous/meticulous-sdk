import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDownloadProgressBar } from "../download-progress";

const { SingleBar } = vi.hoisted(() => ({
  SingleBar: vi.fn(function (this: Record<string, unknown>) {
    this.start = vi.fn();
    this.setTotal = vi.fn();
    this.update = vi.fn();
    this.stop = vi.fn();
  }),
}));

vi.mock("cli-progress", () => ({
  default: { SingleBar, Presets: { shades_classic: {} } },
}));

describe("createDownloadProgressBar", () => {
  beforeEach(() => {
    vi.stubEnv("METICULOUS_IS_CLOUD_REPLAY", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    SingleBar.mockClear();
  });

  it("renders a bar once the total crosses the threshold", () => {
    const progressBar = createDownloadProgressBar();
    progressBar.trackStream(20_000);
    progressBar.stop();

    expect(SingleBar).toHaveBeenCalledTimes(1);
  });

  it("never renders a bar when disabled, but still passes bytes through", async () => {
    const progressBar = createDownloadProgressBar({ enabled: false });
    const { stream } = progressBar.trackStream(20_000);

    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.end(Buffer.from("payload"));
    await new Promise((resolve) => stream.on("end", resolve));
    progressBar.stop();

    expect(Buffer.concat(chunks).toString()).toBe("payload");
    expect(SingleBar).not.toHaveBeenCalled();
  });
});
