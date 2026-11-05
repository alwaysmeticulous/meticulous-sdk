import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthToken, resolveAuthToken } from "../api-token.utils";

const NOT_LOGGED_IN = {
  accessToken: null,
  reason: { kind: "not-logged-in" },
} as const;

const mocks = vi.hoisted(() => ({
  resolveOAuthAccessToken: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../oauth/oauth-refresh", () => ({
  resolveOAuthAccessToken: mocks.resolveOAuthAccessToken,
}));

vi.mock("fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));

describe("getAuthToken precedence", () => {
  const originalEnvToken = process.env["METICULOUS_API_TOKEN"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["METICULOUS_API_TOKEN"];
    mocks.resolveOAuthAccessToken.mockResolvedValue(NOT_LOGGED_IN);
    mocks.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    if (originalEnvToken === undefined) {
      delete process.env["METICULOUS_API_TOKEN"];
    } else {
      process.env["METICULOUS_API_TOKEN"] = originalEnvToken;
    }
  });

  const withFileToken = (token: string) => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(
      Buffer.from(JSON.stringify({ apiToken: token })),
    );
  };

  it("prefers an explicit --apiToken over everything else", async () => {
    process.env["METICULOUS_API_TOKEN"] = "env-token";
    mocks.resolveOAuthAccessToken.mockResolvedValue({
      accessToken: "oauth-token",
    });
    withFileToken("file-token");

    expect(await getAuthToken("flag-token")).toBe("flag-token");
    expect(mocks.resolveOAuthAccessToken).not.toHaveBeenCalled();
  });

  it("prefers OAuth over the env var and config file", async () => {
    process.env["METICULOUS_API_TOKEN"] = "env-token";
    mocks.resolveOAuthAccessToken.mockResolvedValue({
      accessToken: "oauth-token",
    });
    withFileToken("file-token");

    expect(await getAuthToken(null)).toBe("oauth-token");
  });

  it("prefers the env var over the config file when no OAuth token exists", async () => {
    process.env["METICULOUS_API_TOKEN"] = "env-token";
    withFileToken("file-token");

    expect(await getAuthToken(null)).toBe("env-token");
  });

  it("falls back to the config file when nothing else is set", async () => {
    withFileToken("file-token");

    expect(await getAuthToken(null)).toBe("file-token");
  });

  it("returns null when no credential is available", async () => {
    expect(await getAuthToken(null)).toBeNull();
  });
});

describe("resolveAuthToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("METICULOUS_API_TOKEN", "");
    mocks.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports why the OAuth login was unusable when nothing else is set", async () => {
    mocks.resolveOAuthAccessToken.mockResolvedValue({
      accessToken: null,
      reason: { kind: "refresh-failed", detail: "HTTP 503" },
    });

    expect(await resolveAuthToken(null)).toEqual({
      token: null,
      missingReason: { kind: "refresh-failed", detail: "HTTP 503" },
    });
  });

  it("returns the env token without a reason when the OAuth login is unusable", async () => {
    vi.stubEnv("METICULOUS_API_TOKEN", "env-token");
    mocks.resolveOAuthAccessToken.mockResolvedValue({
      accessToken: null,
      reason: { kind: "login-rejected", detail: "HTTP 400: invalid_grant" },
    });

    expect(await resolveAuthToken(null)).toEqual({ token: "env-token" });
  });

  it("treats an empty OAuth access token as no login, falling back to the env token", async () => {
    vi.stubEnv("METICULOUS_API_TOKEN", "env-token");
    mocks.resolveOAuthAccessToken.mockResolvedValue({ accessToken: "" });

    expect(await resolveAuthToken(null)).toEqual({ token: "env-token" });
  });

  it("explains an empty OAuth access token as not logged in when nothing else is set", async () => {
    mocks.resolveOAuthAccessToken.mockResolvedValue({ accessToken: "" });

    expect(await resolveAuthToken(null)).toEqual({
      token: null,
      missingReason: { kind: "not-logged-in" },
    });
  });
});
