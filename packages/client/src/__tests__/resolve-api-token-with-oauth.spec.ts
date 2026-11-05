import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApiTokenWithOAuth } from "../client";

// Never touch the real ~/.meticulous: token store, login and migration are all
// mocked.
const mocks = vi.hoisted(() => ({
  resolveAuthToken: vi.fn(),
  getApiToken: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
  performOAuthLogin: vi.fn(),
  migrateLegacySelectedProjectIfPresent: vi.fn(),
}));

const NOT_LOGGED_IN = {
  token: null,
  missingReason: { kind: "not-logged-in" },
} as const;

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return { ...actual, logProgress: vi.fn() };
});

vi.mock("../api-token.utils", () => ({
  resolveAuthToken: mocks.resolveAuthToken,
  getApiToken: mocks.getApiToken,
}));

vi.mock("../oauth/oauth-token-store", () => ({
  getStoredOAuthTokens: mocks.getStoredOAuthTokens,
}));

vi.mock("../oauth/oauth-login", () => ({
  performOAuthLogin: mocks.performOAuthLogin,
}));

vi.mock("../oauth/legacy-project-migration", () => ({
  migrateLegacySelectedProjectIfPresent:
    mocks.migrateLegacySelectedProjectIfPresent,
}));

describe("resolveApiTokenWithOAuth", () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CI", "");
    process.stdin.isTTY = true;
    mocks.resolveAuthToken.mockResolvedValue(NOT_LOGGED_IN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.stdin.isTTY = originalIsTTY;
  });

  it("starts a browser login when no OAuth login is stored", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.performOAuthLogin.mockResolvedValue({ accessToken: "new-access" });

    await expect(
      resolveApiTokenWithOAuth({ apiToken: null, enableOAuthLogin: true }),
    ).resolves.toBe("new-access");
    expect(mocks.performOAuthLogin).toHaveBeenCalledTimes(1);
  });

  it("keeps a stored login whose refresh failed instead of starting a browser login", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      accessToken: "expired-access",
      refreshToken: "refresh-1",
      expiresAt: 0,
    });

    await expect(
      resolveApiTokenWithOAuth({ apiToken: null, enableOAuthLogin: true }),
    ).resolves.toBeNull();
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
  });
});
