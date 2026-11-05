import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientWithOAuth } from "../client";
import { isMissingCredentialsError } from "../missing-credentials";

const mocks = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
  resolveAuthToken: vi.fn(),
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
  resolveAuthToken: mocks.resolveAuthToken,
  getApiToken: mocks.getApiToken,
}));

vi.mock("../oauth/oauth-token-store", () => ({
  getStoredOAuthTokens: mocks.getStoredOAuthTokens,
}));

const NOT_LOGGED_IN = {
  token: null,
  missingReason: { kind: "not-logged-in" },
} as const;

const STORED_TOKENS = {
  accessToken: "oauth-1",
  refreshToken: "r",
  expiresAt: 9999999999,
};

const unauthorizedResponse = () => ({
  ok: false,
  status: 401,
  statusText: "Unauthorized",
  headers: { forEach: () => {}, get: () => "application/json" },
  json: () => ({ message: "Unauthorized" }),
  text: () => "",
});

const okResponse = () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { forEach: () => {}, get: () => "application/json" },
  json: () => ({ ok: true }),
  text: () => "",
});

const authHeaderOfCall = (callIndex: number): string | undefined => {
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
    // fails (clearing stored OAuth), resolveAuthToken falls back to the env token.
    mocks.resolveAuthToken
      .mockResolvedValueOnce({ token: "oauth-1" })
      .mockResolvedValueOnce({ token: "oauth-1" })
      .mockResolvedValue({ token: "env-token" });

    const client = await createClientWithOAuth({ apiToken: null });

    await client.get("a");
    await client.get("b");

    expect(authHeaderOfCall(0)).toBe("oauth-1");
    expect(authHeaderOfCall(1)).toBe("env-token");
  });

  it("uses a static token verbatim when an explicit --apiToken is provided", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.resolveAuthToken.mockResolvedValue({ token: "flag-token" });

    const client = await createClientWithOAuth({ apiToken: "flag-token" });

    await client.get("a");
    await client.get("b");

    // Static path resolves once up front; resolveAuthToken is not re-invoked per
    // request (only the single up-front resolve).
    expect(mocks.resolveAuthToken).toHaveBeenCalledTimes(1);
    expect(authHeaderOfCall(0)).toBe("flag-token");
    expect(authHeaderOfCall(1)).toBe("flag-token");
  });

  it("builds an unauthenticated client when no token can be resolved", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.resolveAuthToken.mockResolvedValue(NOT_LOGGED_IN);

    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: false,
    });

    await client.get("a");

    expect(authHeaderOfCall(0)).toBeUndefined();
  });

  describe("auth failure without credentials", () => {
    beforeEach(() => {
      mocks.meticulousFetch.mockResolvedValue(unauthorizedResponse());
    });

    it("explains that the stored login was rejected and removed", async () => {
      mocks.getStoredOAuthTokens.mockReturnValue(null);
      mocks.resolveAuthToken.mockResolvedValue({
        token: null,
        missingReason: {
          kind: "login-rejected",
          detail: "HTTP 400: invalid_grant",
        },
      });

      const client = await createClientWithOAuth({ apiToken: null });

      await expect(client.get("a")).rejects.toThrow(
        /no longer valid \(HTTP 400: invalid_grant\)[\s\S]*meticulous auth login/,
      );
    });

    it("explains a failed refresh of the stored login", async () => {
      mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);
      mocks.resolveAuthToken.mockResolvedValue({
        token: null,
        missingReason: { kind: "refresh-failed", detail: "fetch failed" },
      });

      const client = await createClientWithOAuth({ apiToken: null });

      await expect(client.get("a")).rejects.toThrow(
        /refreshing it failed \(fetch failed\)/,
      );
    });

    it("reports a login removed mid-command rather than never logged in", async () => {
      mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);
      mocks.resolveAuthToken
        .mockResolvedValueOnce({
          token: null,
          missingReason: { kind: "refresh-failed", detail: "fetch failed" },
        })
        .mockResolvedValue(NOT_LOGGED_IN);

      const client = await createClientWithOAuth({ apiToken: null });

      await expect(client.get("a")).rejects.toThrow(
        /login was removed while this command was running/,
      );
    });

    it("sends no stale token once a valid login is rejected mid-command", async () => {
      mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);
      mocks.resolveAuthToken
        .mockResolvedValueOnce({ token: "oauth-1" })
        .mockResolvedValue({
          token: null,
          missingReason: {
            kind: "login-rejected",
            detail: "HTTP 400: invalid_grant",
          },
        });

      const client = await createClientWithOAuth({ apiToken: null });
      const error: unknown = await client.get("a").catch((e: unknown) => e);

      expect(authHeaderOfCall(0)).toBeUndefined();
      expect(isMissingCredentialsError(error)).toBe(true);
      expect(isMissingCredentialsError(error) && error.missingReason.kind).toBe(
        "login-rejected",
      );
    });

    it("sends no stale token once a valid login is cleared mid-command", async () => {
      mocks.getStoredOAuthTokens.mockReturnValue(STORED_TOKENS);
      mocks.resolveAuthToken
        .mockResolvedValueOnce({ token: "oauth-1" })
        .mockResolvedValue(NOT_LOGGED_IN);

      const client = await createClientWithOAuth({ apiToken: null });
      const error: unknown = await client.get("a").catch((e: unknown) => e);

      expect(authHeaderOfCall(0)).toBeUndefined();
      expect(isMissingCredentialsError(error)).toBe(true);
      expect(isMissingCredentialsError(error) && error.missingReason.kind).toBe(
        "login-cleared",
      );
    });
  });
});
