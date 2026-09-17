import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../utils/cli-user-error";
import { OutOfDateCLIError } from "../utils/out-of-date-client-error";
import { wrapHandler } from "./sentry.utils";

const { logger } = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => logger,
}));
vi.mock("@alwaysmeticulous/client", () => ({
  isFetchError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    "message" in error,
}));
vi.mock("@alwaysmeticulous/sentry", () => ({
  SENTRY_FLUSH_TIMEOUT: { toMillis: () => 1 },
}));
vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  getActiveSpan: vi.fn().mockReturnValue(null),
  setContext: vi.fn(),
}));

const fetchError = (status: number): Error =>
  Object.assign(new Error("Request failed"), {
    response: { status, data: { message: "Server message" } },
  });

describe("wrapHandler structured errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${String(code)}`);
    });
  });

  it.each([
    [
      new CliUserError("Bad arguments", 4, "error", { reason: "usage" }),
      4,
      { outcome: "failed", reason: "usage", message: "Bad arguments" },
    ],
    [
      new CliUserError("Run failed", 1, "error", { reason: "remote" }),
      1,
      { outcome: "failed", reason: "remote", message: "Run failed" },
    ],
    [
      new CliUserError("No sessions", 4, "warn", {
        outcome: "skipped",
        reason: "all_sessions_excluded",
      }),
      4,
      {
        outcome: "skipped",
        reason: "all_sessions_excluded",
        message: "No sessions",
        testRunId: null,
        status: null,
      },
    ],
    [
      fetchError(401),
      1,
      { outcome: "failed", reason: "auth", message: "Server message" },
    ],
    [
      fetchError(503),
      1,
      { outcome: "failed", reason: "remote", message: "Server message" },
    ],
    [
      new OutOfDateCLIError(),
      1,
      expect.objectContaining({ reason: "cli_out_of_date" }),
    ],
    [
      Object.assign(new Error("Missing build"), { code: "ENOENT" }),
      1,
      expect.objectContaining({ reason: "environment" }),
    ],
  ])("prints %j and exits %i", async (error, exitCode, printed) => {
    const handler = wrapHandler(() => Promise.reject(error), {
      structuredErrors: true,
    });
    await expect(handler({ json: true })).rejects.toThrow(`exit:${exitCode}`);
    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual(printed);
  });

  it("does not print JSON unless structured errors are enabled", async () => {
    const handler = wrapHandler(() =>
      Promise.reject(new CliUserError("Bad arguments")),
    );
    await expect(handler({ json: true })).rejects.toThrow("exit:1");
    expect(console.log).not.toHaveBeenCalled();
  });
});
