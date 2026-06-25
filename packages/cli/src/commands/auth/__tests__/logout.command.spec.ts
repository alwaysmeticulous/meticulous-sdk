import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { logoutCommand } from "../logout.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
}));

const mocks = vi.hoisted(() => ({
  clearOAuthTokens: vi.fn(),
  clearStoredProject: vi.fn(),
  readFileBasedToken: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  clearOAuthTokens: mocks.clearOAuthTokens,
  clearStoredProject: mocks.clearStoredProject,
  readFileBasedToken: mocks.readFileBasedToken,
}));

const runHandler = (args: { dryRun?: boolean } = {}) =>
  (logoutCommand as { handler: (args: unknown) => Promise<void> }).handler(
    args,
  );

const warnedText = () => loggerMock.warn.mock.calls.flat().join("\n");

describe("logout command", () => {
  const originalEnvToken = process.env["METICULOUS_API_TOKEN"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["METICULOUS_API_TOKEN"];
    mocks.readFileBasedToken.mockReturnValue(null);
  });

  afterAll(() => {
    if (originalEnvToken === undefined) {
      delete process.env["METICULOUS_API_TOKEN"];
    } else {
      process.env["METICULOUS_API_TOKEN"] = originalEnvToken;
    }
  });

  it("clears OAuth tokens and the selected project", async () => {
    await runHandler();

    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
    expect(mocks.clearStoredProject).toHaveBeenCalled();
    expect(warnedText()).toBe("");
  });

  it("does not clear anything on a dry run", async () => {
    await runHandler({ dryRun: true });

    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
    expect(mocks.clearStoredProject).not.toHaveBeenCalled();
  });

  it("warns when METICULOUS_API_TOKEN is still set", async () => {
    process.env["METICULOUS_API_TOKEN"] = "still-here";

    await runHandler();

    expect(warnedText()).toContain("METICULOUS_API_TOKEN");
  });

  it("warns about a lingering config-file token, naming its path", async () => {
    mocks.readFileBasedToken.mockReturnValue({
      token: "file-token",
      path: "/home/me/.meticulous/config.json",
    });

    await runHandler();

    expect(warnedText()).toContain("/home/me/.meticulous/config.json");
  });

  it("does not fail logout when the config file is malformed", async () => {
    mocks.clearOAuthTokens.mockClear();
    mocks.readFileBasedToken.mockImplementation(() => {
      throw new SyntaxError("Unexpected token in JSON");
    });

    await expect(runHandler()).resolves.toBeUndefined();
    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
  });
});
