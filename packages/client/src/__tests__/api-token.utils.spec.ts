import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthToken } from "../api-token.utils";

const mocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../oauth/oauth-refresh", () => ({
  getValidAccessToken: mocks.getValidAccessToken,
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
    mocks.getValidAccessToken.mockResolvedValue(null);
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
    mocks.getValidAccessToken.mockResolvedValue("oauth-token");
    withFileToken("file-token");

    expect(await getAuthToken("flag-token")).toBe("flag-token");
    expect(mocks.getValidAccessToken).not.toHaveBeenCalled();
  });

  it("prefers OAuth over the env var and config file", async () => {
    process.env["METICULOUS_API_TOKEN"] = "env-token";
    mocks.getValidAccessToken.mockResolvedValue("oauth-token");
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
