import type * as Client from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { screenshotDomCommand } from "./screenshot-dom.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getScreenshotDom: vi.fn(),
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
  getScreenshotDom: mocks.getScreenshotDom,
}));

const runHandler = (args: Record<string, unknown> = {}) =>
  (
    screenshotDomCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    replayId: "r-1",
    screenshotName: "end-state",
    json: false,
    ...args,
  });

const RESPONSE = {
  dom: '<body>\n  <main class="a">',
  notes: ["lines 1-2 of 9; use --offset and/or --limit to view more"],
};

describe("dom command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getScreenshotDom.mockResolvedValue(RESPONSE);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints the HTML on stdout and the notes on stderr", async () => {
    await runHandler();

    expect(mocks.getScreenshotDom).toHaveBeenCalledWith(
      {},
      "r-1",
      "end-state",
      {},
    );
    expect(logSpy).toHaveBeenCalledWith(RESPONSE.dom);
    expect(mocks.logNotice).toHaveBeenCalledWith(RESPONSE.notes[0]);
  });

  it("prints { dom } under --json", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(logSpy.mock.calls.flat().join("\n"))).toEqual({
      dom: RESPONSE.dom,
    });
  });

  it.each([
    ["0,2,1", [0, 2, 1]],
    ["[0, 2]", [0, 2]],
    ["", []],
  ])("passes --path=%j as %j, with the page", async (path, expected) => {
    await runHandler({ path, limit: 50, offset: 100 });

    expect(mocks.getScreenshotDom).toHaveBeenCalledWith(
      {},
      "r-1",
      "end-state",
      { path: expected, limit: 50, offset: 100 },
    );
  });

  it.each(["0,a", "0,,1", "-1"])(
    "rejects --path=%j before calling the backend",
    async (path) => {
      await expect(runHandler({ path })).rejects.toThrow(
        /--path must be comma-separated non-negative integers/,
      );
      expect(mocks.getScreenshotDom).not.toHaveBeenCalled();
    },
  );

  it("rejects a repeated --path, which yargs parses as an array", async () => {
    await expect(runHandler({ path: ["0", "1"] })).rejects.toThrow(
      new CliUserError(
        "--path can be given only once: pass one comma-separated path, e.g. 0,2,1.",
      ),
    );
    expect(mocks.getScreenshotDom).not.toHaveBeenCalled();
  });

  it("fails once, without polling, on an unfinished replay", async () => {
    const refusal = new Error(
      "Replay r-1 is still Running; its screenshot DOM is available once it has finished.",
    );
    mocks.getScreenshotDom.mockRejectedValue(refusal);

    await expect(runHandler()).rejects.toBe(refusal);

    expect(mocks.getScreenshotDom).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
