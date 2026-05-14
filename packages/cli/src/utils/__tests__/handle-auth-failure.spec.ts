import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import { handleAuthFailure } from "../handle-auth-failure";

const mocks = vi.hoisted(() => ({
  clearOAuthTokens: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
  isJwtExpired: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  clearOAuthTokens: mocks.clearOAuthTokens,
  getStoredOAuthTokens: mocks.getStoredOAuthTokens,
  // Use a real shape-check for fetch errors so the unit test stays close
  // to production behavior.
  isFetchError: (error: unknown): boolean =>
    !!error && typeof error === "object" && "response" in (error as object),
  isJwtExpired: mocks.isJwtExpired,
}));

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
      handleAuthFailure(
        makeFetchError(403, { message: "audience mismatch" }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).message).toContain("HTTP 403");
    expect((caught as CliUserError).message).toContain("audience mismatch");
    expect((caught as CliUserError).message).toContain("auth logout");
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("throws with status when the response body has no message", () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.isJwtExpired.mockReturnValue(false);

    expect(() => handleAuthFailure(makeFetchError(401, null))).toThrow(
      /HTTP 401/,
    );
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
  });
});
