import type * as Client from "@alwaysmeticulous/client";
import {
  MissingCredentialsError,
  RejectedCredentialsError,
} from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../cli-user-error";
import {
  handleAuthFailure,
  toAuthFailureCliUserError,
} from "../handle-auth-failure";

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

  it("keeps tokens and throws login guidance when the stored JWT is past exp", () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      accessToken: "expired-jwt",
      refreshToken: "r",
      expiresAt: 0,
    });
    mocks.isJwtExpired.mockReturnValue(true);

    expect(() => handleAuthFailure(makeFetchError(401))).toThrow(
      /could not be refreshed.*meticulous auth login/s,
    );
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
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

  it("says an API token was rejected, not missing, when one was sent without a stored login", () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.isJwtExpired.mockReturnValue(false);

    let caught: unknown;
    try {
      handleAuthFailure(makeFetchError(401, null));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CliUserError);
    const message = (caught as CliUserError).message;
    expect(message).toContain("HTTP 401");
    expect(message).toContain(
      "The credential sent with this request was rejected",
    );
    expect(message).toContain("Check the API token in use");
    expect(message).not.toMatch(/missing|without credentials/);
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

  it("surfaces the client's explanation verbatim when no credential was sent", () => {
    mocks.getStoredOAuthTokens.mockReturnValue({
      accessToken: "expired-jwt",
      refreshToken: "r",
      expiresAt: 0,
    });
    mocks.isJwtExpired.mockReturnValue(true);
    const error = new MissingCredentialsError(makeFetchError(401), {
      kind: "refresh-failed",
      detail: "fetch failed",
    });

    let caught: unknown;
    try {
      handleAuthFailure(error);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBeInstanceOf(CliUserError);
    expect((caught as CliUserError).message).toBe(error.message);
    expect((caught as CliUserError).message).toMatch(
      /sent without credentials[\s\S]*refreshing it failed \(fetch failed\)/,
    );
  });

  describe("for a credential the client tagged as rejected", () => {
    const LOGOUT_ADVICE =
      "If your login is stale, run `meticulous auth logout` and re-run the command.";
    const API_TOKEN_ADVICE =
      "Check the API token in use (--apiToken, METICULOUS_API_TOKEN or the " +
      "Meticulous config file), or run `meticulous auth login` to use your " +
      "own login instead.";

    const rejected = (credentialKind: "oauth-login" | "api-token") =>
      new RejectedCredentialsError(
        makeFetchError(403, { message: "No access to this project" }),
        credentialKind,
      );

    it("points a rejected OAuth login at `meticulous auth logout`", () => {
      mocks.getStoredOAuthTokens.mockReturnValue({ accessToken: "valid-jwt" });
      mocks.isJwtExpired.mockReturnValue(false);

      expect(toAuthFailureCliUserError(rejected("oauth-login"))?.message).toBe(
        "Authentication failed (HTTP 403): No access to this project\n" +
          "The credential sent with this request was rejected, or does not " +
          "have access to this project or resource. " +
          LOGOUT_ADVICE,
      );
    });

    it("treats a rejected OAuth login whose stored token expired as transient", () => {
      mocks.getStoredOAuthTokens.mockReturnValue({ accessToken: "expired" });
      mocks.isJwtExpired.mockReturnValue(true);

      expect(
        toAuthFailureCliUserError(rejected("oauth-login"))?.message,
      ).toMatch(/could not be refreshed.*meticulous auth login/s);
    });

    it("points a rejected API token at the token in use, even with a stored login", () => {
      mocks.getStoredOAuthTokens.mockReturnValue({ accessToken: "expired" });
      mocks.isJwtExpired.mockReturnValue(true);

      const message = toAuthFailureCliUserError(rejected("api-token"))?.message;

      expect(message).toMatch(/^Authentication failed \(HTTP 403\): No access/);
      expect(message).toContain(API_TOKEN_ADVICE);
      expect(message).not.toMatch(/auth logout|could not be refreshed/);
    });

    it("throws the same explanation from handleAuthFailure", () => {
      mocks.getStoredOAuthTokens.mockReturnValue(null);
      const error = rejected("api-token");

      expect(() => handleAuthFailure(error)).toThrow(
        toAuthFailureCliUserError(error)?.message,
      );
    });

    it("keeps the given upload metadata and reports reason auth", () => {
      mocks.getStoredOAuthTokens.mockReturnValue(null);

      const converted = toAuthFailureCliUserError(rejected("api-token"), {
        sourceDeploymentId: "deploy-1",
      });

      expect(converted).toBeInstanceOf(CliUserError);
      expect(converted?.reason).toBe("auth");
      expect(converted?.sourceDeploymentId).toBe("deploy-1");
    });
  });

  it("returns null from toAuthFailureCliUserError for non-auth errors", () => {
    expect(toAuthFailureCliUserError(new Error("boom"))).toBeNull();
    expect(toAuthFailureCliUserError(makeFetchError(500))).toBeNull();
  });
});
