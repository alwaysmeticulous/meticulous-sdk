import * as Sentry from "@sentry/node";
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
  isAuthFailureStatus: (status: number | undefined) =>
    status === 401 || status === 403,
  isMissingCredentialsError: (error: unknown) =>
    error instanceof Error && error.name === "MissingCredentialsError",
  isRejectedCredentialsError: (error: unknown) =>
    error instanceof Error && error.name === "RejectedCredentialsError",
  getStoredOAuthTokens: () => ({ accessToken: "stored-login" }),
  isJwtExpired: () => false,
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

const missingCredentialsError = (): Error =>
  Object.assign(new Error("Authentication failed (HTTP 401): log in"), {
    name: "MissingCredentialsError",
    missingReason: { kind: "not-logged-in" },
    response: { status: 401, data: { message: "Unauthorized" } },
  });

const rejectedApiTokenError = (): Error =>
  Object.assign(new Error("No access to this project\n\nGET /api/x"), {
    name: "RejectedCredentialsError",
    credentialKind: "api-token",
    response: { status: 403, data: { message: "No access to this project" } },
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
      {
        cliVersion: "unknown",
        outcome: "failed",
        reason: "usage",
        message: "Bad arguments",
      },
    ],
    [
      new CliUserError("Run failed", 1, "error", { reason: "remote" }),
      1,
      {
        cliVersion: "unknown",
        outcome: "failed",
        reason: "remote",
        message: "Run failed",
      },
    ],
    [
      new CliUserError("Run aborted", 1, "error", {
        reason: "remote",
        sourceDeploymentId: "deploy-1",
        testRunId: "run-1",
        testRunUrl: "https://app.meticulous.ai/test-runs/run-1",
      }),
      1,
      {
        cliVersion: "unknown",
        outcome: "failed",
        reason: "remote",
        message: "Run aborted",
        testRunId: "run-1",
        sourceDeploymentId: "deploy-1",
        testRunUrl: "https://app.meticulous.ai/test-runs/run-1",
      },
    ],
    [
      new CliUserError("No sessions", 4, "warn", {
        outcome: "skipped",
        reason: "all_sessions_excluded",
      }),
      4,
      {
        cliVersion: "unknown",
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
      {
        cliVersion: "unknown",
        outcome: "failed",
        reason: "auth",
        message: "Server message",
      },
    ],
    [
      fetchError(503),
      1,
      {
        cliVersion: "unknown",
        outcome: "failed",
        reason: "remote",
        message: "Server message",
      },
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

  it("reports a request sent without credentials as a user auth error", async () => {
    const error = missingCredentialsError();
    const handler = wrapHandler(() => Promise.reject(error), {
      structuredErrors: true,
    });

    await expect(handler({ json: true })).rejects.toThrow("exit:1");

    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual({
      cliVersion: "unknown",
      outcome: "failed",
      reason: "auth",
      message: error.message,
    });
    expect(logger.error.mock.calls).toEqual([[error.message]]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports a rejected credential from any command as a user auth error", async () => {
    const handler = wrapHandler(() => Promise.reject(rejectedApiTokenError()), {
      structuredErrors: true,
    });

    await expect(handler({ json: true })).rejects.toThrow("exit:1");

    const expectedMessage =
      "Authentication failed (HTTP 403): No access to this project\n" +
      "The credential sent with this request was rejected, or does not have " +
      "access to this project or resource. Check the API token in use " +
      "(--apiToken, METICULOUS_API_TOKEN or the Meticulous config file), or " +
      "run `meticulous auth login` to use your own login instead.";
    expect(
      JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0])),
    ).toEqual({
      cliVersion: "unknown",
      outcome: "failed",
      reason: "auth",
      message: expectedMessage,
    });
    expect(logger.error.mock.calls).toEqual([[expectedMessage]]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("does not print JSON unless structured errors are enabled", async () => {
    const handler = wrapHandler(() =>
      Promise.reject(new CliUserError("Bad arguments")),
    );
    await expect(handler({ json: true })).rejects.toThrow("exit:1");
    expect(console.log).not.toHaveBeenCalled();
  });
});
