import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissingCredentialReason } from "../auth-resolution.types";
import { maybeEnrichMissingAuthFetchError } from "../errors";
import {
  buildMissingCredentialsMessage,
  isMissingCredentialsError,
  MISSING_AUTH_GUIDANCE,
} from "../missing-credentials";
import { EXPIRED_JWT, VALID_JWT } from "./fake-fetch";

const { getStoredOAuthTokens } = vi.hoisted(() => ({
  getStoredOAuthTokens: vi.fn(),
}));

vi.mock("../oauth/oauth-token-store", () => ({
  getStoredOAuthTokens: () => getStoredOAuthTokens(),
}));

const makeFetchError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    response: { status, statusText: "", data: null, headers: {} },
    config: { url: "https://app.meticulous.ai/api/agent/whoami" },
  });

describe("buildMissingCredentialsMessage", () => {
  it.each<[string, MissingCredentialReason, RegExp]>([
    [
      "not-logged-in",
      { kind: "not-logged-in" },
      /You are not logged in, and no API token is set\./,
    ],
    [
      "login-expired",
      { kind: "login-expired" },
      /login expired and could not be renewed \(it has no refresh token\)/,
    ],
    [
      "login-rejected",
      { kind: "login-rejected", detail: "HTTP 400: invalid_grant" },
      /login is no longer valid \(HTTP 400: invalid_grant\)/,
    ],
    [
      "login-cleared",
      { kind: "login-cleared" },
      /login was removed while this command was running/,
    ],
  ])(
    "explains %s and leads with `meticulous auth login`",
    (_name, reason, explanation) => {
      const message = buildMissingCredentialsMessage(401, reason);

      expect(message).toMatch(
        /^Authentication failed \(HTTP 401\): the request was sent without credentials\. /,
      );
      expect(message).toMatch(explanation);
      expect(message).toContain(MISSING_AUTH_GUIDANCE);
      expect(message.indexOf("meticulous auth login")).toBeLessThan(
        message.indexOf("METICULOUS_API_TOKEN or pass --apiToken"),
      );
      expect(message).not.toMatch(/probably missing/);
    },
  );

  it("asks to retry, not to log in again first, when the refresh failed transiently", () => {
    const message = buildMissingCredentialsMessage(401, {
      kind: "refresh-failed",
      detail: "fetch failed (getaddrinfo ENOTFOUND issuer.example)",
    });

    expect(message).toBe(
      "Authentication failed (HTTP 401): the request was sent without " +
        "credentials. Your Meticulous login has expired and refreshing it " +
        "failed (fetch failed (getaddrinfo ENOTFOUND issuer.example)). Your " +
        "login has been kept.\nRe-run the command to retry; if this keeps " +
        "happening, run `meticulous auth login` to log in again.",
    );
  });

  it("asks to retry when a stored login expired and no API token is set", () => {
    expect(
      buildMissingCredentialsMessage(401, { kind: "login-not-renewed" }),
    ).toBe(
      "Authentication failed (HTTP 401): the request was sent without " +
        "credentials. Your Meticulous login has expired and could not be " +
        "renewed, and no API token is set. Your login has been kept.\n" +
        "Re-run the command to retry; if this keeps happening, run " +
        "`meticulous auth login` to log in again. If this command " +
        "authenticates with an API token only, pass --apiToken or set " +
        "METICULOUS_API_TOKEN instead.",
    );
  });

  it("asks for an API token when the caller does not use the stored login", () => {
    const message = buildMissingCredentialsMessage(401, {
      kind: "login-not-used",
    });

    expect(message).toMatch(/authenticates with an API token only/);
    expect(message).toMatch(/\nPass --apiToken or set METICULOUS_API_TOKEN\.$/);
    expect(message).not.toContain("meticulous auth login");
  });
});

describe("maybeEnrichMissingAuthFetchError", () => {
  beforeEach(() => {
    getStoredOAuthTokens.mockReset();
    getStoredOAuthTokens.mockReturnValue(null);
  });

  it("leaves auth failures alone when a credential was sent", () => {
    const error = makeFetchError(401);

    expect(maybeEnrichMissingAuthFetchError(error, { token: "t" })).toBe(error);
  });

  it("leaves non-auth failures alone when no credential was sent", () => {
    const error = makeFetchError(500);

    expect(
      maybeEnrichMissingAuthFetchError(error, {
        token: null,
        missingReason: { kind: "not-logged-in" },
      }),
    ).toBe(error);
  });

  it("replaces a credential-less 401 with a MissingCredentialsError carrying the response", () => {
    const error = makeFetchError(401);

    const enriched = maybeEnrichMissingAuthFetchError(error, {
      token: null,
      missingReason: { kind: "login-cleared" },
    });

    expect(isMissingCredentialsError(enriched)).toBe(true);
    expect(enriched.response).toBe(error.response);
    expect(enriched.config).toBe(error.config);
    expect(enriched.message).toMatch(/removed while this command was running/);
  });

  it("treats an empty token as no credential sent", () => {
    const enriched = maybeEnrichMissingAuthFetchError(makeFetchError(401), {
      token: "",
    });

    expect(isMissingCredentialsError(enriched)).toBe(true);
    expect(
      isMissingCredentialsError(enriched) && enriched.missingReason.kind,
    ).toBe("not-logged-in");
  });

  it("does not consult the stored login when the resolution says why", () => {
    getStoredOAuthTokens.mockReturnValue({ accessToken: VALID_JWT });

    const enriched = maybeEnrichMissingAuthFetchError(makeFetchError(401), {
      token: null,
      missingReason: { kind: "login-expired" },
    });

    expect(
      isMissingCredentialsError(enriched) && enriched.missingReason.kind,
    ).toBe("login-expired");
    expect(getStoredOAuthTokens).not.toHaveBeenCalled();
  });

  describe("boolean form", () => {
    it("leaves the error alone when an Authorization header was sent", () => {
      const error = makeFetchError(401);

      expect(maybeEnrichMissingAuthFetchError(error, true)).toBe(error);
    });

    it.each<[string, string | null, MissingCredentialReason["kind"]]>([
      ["no stored login", null, "not-logged-in"],
      ["an expired stored login", EXPIRED_JWT, "login-not-renewed"],
      ["a valid stored login", VALID_JWT, "login-not-used"],
    ])(
      "explains a credential-less auth failure with %s",
      (_name, accessToken, kind) => {
        getStoredOAuthTokens.mockReturnValue(
          accessToken === null ? null : { accessToken },
        );

        const enriched = maybeEnrichMissingAuthFetchError(
          makeFetchError(403),
          false,
        );

        expect(isMissingCredentialsError(enriched)).toBe(true);
        expect(
          isMissingCredentialsError(enriched) && enriched.missingReason.kind,
        ).toBe(kind);
        expect(enriched.message).toMatch(/^Authentication failed \(HTTP 403\)/);
      },
    );
  });
});

describe("isMissingCredentialsError", () => {
  it("recognises an error from another copy of the package by name and reason", () => {
    const foreign = Object.assign(new Error("Authentication failed"), {
      name: "MissingCredentialsError",
      missingReason: { kind: "not-logged-in" },
    });

    expect(isMissingCredentialsError(foreign)).toBe(true);
  });

  it.each([
    ["a plain error", new Error("x")],
    [
      "a same-named error without a reason",
      Object.assign(new Error("x"), { name: "MissingCredentialsError" }),
    ],
    [
      "a same-named error whose reason has no kind",
      Object.assign(new Error("x"), {
        name: "MissingCredentialsError",
        missingReason: {},
      }),
    ],
    [
      "a non-error object",
      { name: "MissingCredentialsError", missingReason: { kind: "x" } },
    ],
  ])("rejects %s", (_name, value) => {
    expect(isMissingCredentialsError(value)).toBe(false);
  });
});
