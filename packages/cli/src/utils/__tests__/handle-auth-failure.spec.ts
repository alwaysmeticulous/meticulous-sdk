import type * as Client from "@alwaysmeticulous/client";
import { MISSING_AUTH_GUIDANCE } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import { handleAuthFailure } from "../handle-auth-failure";

const mocks = vi.hoisted(() => ({
  clearOAuthTokens: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
  isJwtExpired: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => {
  const actual = await importOriginal<typeof Client>();
  return {
    ...actual,
    clearOAuthTokens: mocks.clearOAuthTokens,
    getStoredOAuthTokens: mocks.getStoredOAuthTokens,
    isJwtExpired: mocks.isJwtExpired,
  };
});

const makeFetchError = (status: number, data: unknown = null) =>
  Object.assign(new Error(`HTTP ${status}`), {
    response: { status, statusText: "", data, headers: {} },
  });

describe("handleAuthFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for non-fetch errors", () => {
    expect(handleAuthFailure(new Error("boom"))).toBe(false);
    expect(handleAuthFailure("not-an-error")).toBe(false);
    expect(handleAuthFailure(null)).toBe(false);
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("returns false for fetch errors with non-auth status codes", () => {
    expect(handleAuthFailure(makeFetchError(500))).toBe(false);
    expect(handleAuthFailure(makeFetchError(404))).toBe(false);
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("clears tokens and throws when the stored JWT is past exp", () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      accessToken: "expired-jwt",
      refreshToken: "r",
      expiresAt: 0,
    });
    mocks.isJwtExpired.mockReturnValue(true);

    expect(() => handleAuthFailure(makeFetchError(401))).toThrow(CliUserError);
    expect(mocks.clearOAuthTokens).toHaveBeenCalledTimes(1);
  });

  it("keeps tokens and throws with backend message when JWT is not expired", () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      accessToken: "valid-jwt",
      refreshToken: "r",
      expiresAt: 9999999999,
    });
    mocks.isJwtExpired.mockReturnValue(false);

    let caught: unknown;
    try {
      handleAuthFailure(makeFetchError(403, { message: "audience mismatch" }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).message).toContain("HTTP 403");
    expect((caught as CliUserError).message).toContain("audience mismatch");
    expect((caught as CliUserError).message).toContain("auth logout");
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("throws missing-auth guidance when no OAuth tokens are stored", () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.isJwtExpired.mockReturnValue(false);

    let caught: unknown;
    try {
      handleAuthFailure(makeFetchError(401, null));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).message).toContain("HTTP 401");
    expect((caught as CliUserError).message).toContain(MISSING_AUTH_GUIDANCE);
  });

  it("accepts a plain-string response body as the server message", () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.isJwtExpired.mockReturnValue(false);

    let caught: unknown;
    try {
      handleAuthFailure(makeFetchError(401, "Token revoked"));
    } catch (error) {
      caught = error;
    }
    expect((caught as CliUserError).message).toContain("Token revoked");
    expect((caught as CliUserError).message).toContain(MISSING_AUTH_GUIDANCE);
  });
});
