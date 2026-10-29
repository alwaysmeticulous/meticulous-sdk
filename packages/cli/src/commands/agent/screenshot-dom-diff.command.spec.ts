import type * as Client from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { domDiffCommand } from "./screenshot-dom-diff.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getScreenshotDomDiffText: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logNotice: mocks.logNotice,
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof Client>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  getScreenshotDomDiffText: mocks.getScreenshotDomDiffText,
}));

const runHandler = (args: Record<string, unknown> = {}) =>
  (domDiffCommand as { handler: (args: unknown) => Promise<void> }).handler({
    replayDiffId: "rd-1",
    screenshotName: "end-state",
    json: false,
    ...args,
  });

const RESPONSE = {
  diff: "diff 0 at path [0,1]\n-  <p>a</p>\n+  <p>b</p>",
  notes: ["1 difference."],
};

describe("dom-diff command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getScreenshotDomDiffText.mockResolvedValue(RESPONSE);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints the diff on stdout and the notes on stderr", async () => {
    await runHandler();

    expect(mocks.getScreenshotDomDiffText).toHaveBeenCalledWith(
      {},
      "rd-1",
      "end-state",
      {},
    );
    expect(logSpy).toHaveBeenCalledWith(RESPONSE.diff);
    expect(mocks.logNotice).toHaveBeenCalledWith("1 difference.");
  });

  it("prints { diff } under --json", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(logSpy.mock.calls.flat().join("\n"))).toEqual({
      diff: RESPONSE.diff,
    });
  });

  it("prints nothing on stdout when there is no difference", async () => {
    mocks.getScreenshotDomDiffText.mockResolvedValue({
      diff: "",
      notes: ["No differences found."],
    });

    await runHandler();

    expect(logSpy).not.toHaveBeenCalled();
    expect(mocks.logNotice).toHaveBeenCalledWith("No differences found.");
  });

  it("passes the context, path and page", async () => {
    await runHandler({ context: "full", path: "[1, 0]", limit: 50, offset: 5 });

    expect(mocks.getScreenshotDomDiffText).toHaveBeenCalledWith(
      {},
      "rd-1",
      "end-state",
      { context: "full", path: [1, 0], limit: 50, offset: 5 },
    );
  });

  it.each(["-1", "1.5", "all"])(
    "rejects --context=%s before calling the backend",
    async (context) => {
      await expect(runHandler({ context })).rejects.toThrow(
        /--context must be a non-negative integer or "full"/,
      );
      expect(mocks.getScreenshotDomDiffText).not.toHaveBeenCalled();
    },
  );
});
