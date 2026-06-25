import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientWithOAuth } from "../client";

const mocks = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
  getAuthToken: vi.fn(),
  getApiToken: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    meticulousFetch: (...args: unknown[]) => mocks.meticulousFetch(...args),
  };
});

vi.mock("../api-token.utils", () => ({
  getAuthToken: mocks.getAuthToken,
  getApiToken: mocks.getApiToken,
}));

vi.mock("../oauth/oauth-token-store", () => ({
  getStoredOAuthTokens: mocks.getStoredOAuthTokens,
  getStoredProjectId: vi.fn().mockReturnValue("project-id"),
  setStoredProject: vi.fn(),
}));

const okResponse = () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { forEach: () => {}, get: () => "application/json" },
  json: () => ({ ok: true }),
  text: () => "",
});

const authHeaderOfCall = (callIndex: number): string => {
  const init = mocks.meticulousFetch.mock.calls[callIndex]?.[1] as {
    headers: Record<string, string>;
  };
  return init.headers.authorization;
};

describe("createClientWithOAuth token provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.meticulousFetch.mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("re-resolves the auth chain per request, falling back off a stale OAuth token after a refresh failure", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      accessToken: "oauth-1",
      refreshToken: "r",
      expiresAt: 9999999999,
    });
    // Up-front resolve + first request return the OAuth token; once the refresh
    // fails (clearing stored OAuth), getAuthToken falls back to the env token.
    mocks.getAuthToken
      .mockResolvedValueOnce("oauth-1")
      .mockResolvedValueOnce("oauth-1")
      .mockResolvedValue("env-token");

    const client = await createClientWithOAuth({ apiToken: null });

    await client.get("a");
    await client.get("b");

    expect(authHeaderOfCall(0)).toBe("oauth-1");
    expect(authHeaderOfCall(1)).toBe("env-token");
  });

  it("uses a static token verbatim when an explicit --apiToken is provided", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.getAuthToken.mockResolvedValue("flag-token");

    const client = await createClientWithOAuth({ apiToken: "flag-token" });

    await client.get("a");
    await client.get("b");

    // Static path resolves once up front; getAuthToken is not re-invoked per
    // request (only the single up-front resolve).
    expect(mocks.getAuthToken).toHaveBeenCalledTimes(1);
    expect(authHeaderOfCall(0)).toBe("flag-token");
    expect(authHeaderOfCall(1)).toBe("flag-token");
  });
});
