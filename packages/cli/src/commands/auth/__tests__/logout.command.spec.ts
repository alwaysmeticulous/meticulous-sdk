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
  logNotice: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  clearOAuthTokens: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
  readFileBasedToken: vi.fn(),
  revokeOAuthRefreshToken: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  clearOAuthTokens: mocks.clearOAuthTokens,
  getStoredOAuthTokens: mocks.getStoredOAuthTokens,
  readFileBasedToken: mocks.readFileBasedToken,
  revokeOAuthRefreshToken: mocks.revokeOAuthRefreshToken,
}));

const STORED_TOKENS = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: 1_800_000_000,
};

const runHandler = () =>
  (logoutCommand as { handler: (args: unknown) => Promise<void> }).handler({});

const warnedText = () => loggerMock.warn.mock.calls.flat().join("\n");

describe("logout command", () => {
  const originalEnvToken = process.env["METICULOUS_API_TOKEN"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["METICULOUS_API_TOKEN"];
    mocks.readFileBasedToken.mockReturnValue(null);
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.revokeOAuthRefreshToken.mockResolvedValue({ status: "revoked" });
  });

  afterAll(() => {
    if (originalEnvToken === undefined) {
      delete process.env["METICULOUS_API_TOKEN"];
    } else {
      process.env["METICULOUS_API_TOKEN"] = originalEnvToken;
    }
  });

  it("clears OAuth tokens, with nothing to revoke when none are stored", async () => {
    await runHandler();

    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
    expect(mocks.revokeOAuthRefreshToken).not.toHaveBeenCalled();
    expect(warnedText()).toBe("");
  });

  it("revokes the stored refresh token at the issuer before clearing it locally", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);

    await runHandler();

    expect(mocks.revokeOAuthRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
    const revokeOrder =
      mocks.revokeOAuthRefreshToken.mock.invocationCallOrder[0] ?? Infinity;
    const clearOrder = mocks.clearOAuthTokens.mock.invocationCallOrder[0] ?? 0;
    expect(revokeOrder).toBeLessThan(clearOrder);
    expect(warnedText()).toBe("");
  });

  it("skips revocation when the stored tokens carry no refresh token", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      ...STORED_TOKENS,
      refreshToken: "",
    });

    await runHandler();

    expect(mocks.revokeOAuthRefreshToken).not.toHaveBeenCalled();
    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
  });

  it("still clears local tokens and warns when revocation fails", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);
    mocks.revokeOAuthRefreshToken.mockResolvedValue({
      status: "failed",
      reason: "connect ECONNREFUSED",
    });

    await expect(runHandler()).resolves.toBeUndefined();

    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
    expect(warnedText()).toContain("connect ECONNREFUSED");
    expect(warnedText()).toContain("stays valid");
  });

  it("still logs out successfully, warning, if revocation throws", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);
    mocks.revokeOAuthRefreshToken.mockRejectedValue(new Error("boom"));

    await expect(runHandler()).resolves.toBeUndefined();

    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
    expect(warnedText()).toContain("boom");
  });

  it("still logs out successfully if reading the stored tokens throws", async () => {
    mocks.getStoredOAuthTokens.mockImplementation(() => {
      throw new Error("EACCES");
    });

    await expect(runHandler()).resolves.toBeUndefined();

    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
    expect(warnedText()).toContain("EACCES");
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
    mocks.readFileBasedToken.mockImplementation(() => {
      throw new SyntaxError("Unexpected token in JSON");
    });

    await expect(runHandler()).resolves.toBeUndefined();
    expect(mocks.clearOAuthTokens).toHaveBeenCalled();
  });
});
