import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeResponse } from "../../__tests__/fake-fetch";
import { resolveAuthToken } from "../../api-token.utils";
import { CI_OIDC_DEFAULT_AUDIENCE } from "../../api/ci-oidc.api";
import { buildMissingCredentialsMessage } from "../../missing-credentials";
import {
  clearCiOidcTokenCache,
  hasCiOidcEnv,
  hasGitHubActionsOidcEnv,
  requestGitHubActionsOidcToken,
  resolveCiOidcAccessToken,
} from "../ci-oidc-auth";

const mocks = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
  resolveOAuthAccessToken: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    meticulousFetch: mocks.meticulousFetch,
    initLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  };
});

vi.mock("../../oauth/oauth-refresh", () => ({
  resolveOAuthAccessToken: mocks.resolveOAuthAccessToken,
}));

vi.mock("fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));

describe("requestGitHubActionsOidcToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends the audience query parameter without clobbering existing query params", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", { value: "eyJ.github.oidc" }),
    );

    const token = await requestGitHubActionsOidcToken({
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL:
          "https://pipelines.actions.githubusercontent.com/idtoken?api-version=2.0",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gh-runtime-bearer",
      },
    });

    expect(token).toBe("eyJ.github.oidc");
    const [url, init] = mocks.meticulousFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("api-version")).toBe("2.0");
    expect(parsed.searchParams.get("audience")).toBe(CI_OIDC_DEFAULT_AUDIENCE);
    expect(init.method).toBe("GET");
    expect(init.headers["authorization"]).toBe("Bearer gh-runtime-bearer");
    expect(init.headers["accept"]).toBe("application/json; api-version=2.0");
  });

  it("prefers explicit audience over METICULOUS_OIDC_AUDIENCE", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", { value: "eyJ.custom.aud" }),
    );

    await requestGitHubActionsOidcToken({
      audience: "https://custom.example.com",
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL:
          "https://pipelines.actions.githubusercontent.com/idtoken",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gh-runtime-bearer",
        METICULOUS_OIDC_AUDIENCE: "https://ignored.example.com",
      },
    });

    const [url] = mocks.meticulousFetch.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get("audience")).toBe(
      "https://custom.example.com",
    );
  });

  it("throws an actionable error when id-token: write env vars are missing", async () => {
    await expect(requestGitHubActionsOidcToken({ env: {} })).rejects.toThrow(
      /permissions: id-token: write/,
    );
    expect(mocks.meticulousFetch).not.toHaveBeenCalled();
  });
});

describe("resolveCiOidcAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("METICULOUS_API_URL", "https://api.test.meticulous.ai/api/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers explicit oidcToken over METICULOUS_OIDC_TOKEN and GitHub Actions env", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", {
        accessToken: "wfat-explicit",
        expiresAt: "2026-11-27T13:00:00.000Z",
      }),
    );

    const result = await resolveCiOidcAccessToken({
      oidcToken: "eyJ.explicit",
      env: {
        METICULOUS_OIDC_TOKEN: "eyJ.from-env",
        METICULOUS_PROJECT: "acme/from-env",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://gh.example/idtoken",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gh-token",
      },
    });

    expect(result.accessToken).toBe("wfat-explicit");
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.meticulousFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      "https://api.test.meticulous.ai/api/ci-auth/oidc/exchange",
    );
    expect(init.headers["authorization"]).toBe("Bearer eyJ.explicit");
    expect(JSON.parse(init.body)).toEqual({ project: "acme/from-env" });
  });

  it("fetches from GitHub Actions OIDC and exchanges for a Meticulous token", async () => {
    mocks.meticulousFetch
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", { value: "eyJ.github.fresh" }),
      )
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", {
          accessToken: "wfat-github",
          expiresAt: "2026-11-27T13:00:00.000Z",
        }),
      );

    const result = await resolveCiOidcAccessToken({
      project: "acme/web",
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://gh.example/idtoken",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gh-runtime-bearer",
      },
    });

    expect(result.accessToken).toBe("wfat-github");
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(2);
    const [exchangeUrl, exchangeInit] = mocks.meticulousFetch.mock.calls[1] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(exchangeUrl).toBe(
      "https://api.test.meticulous.ai/api/ci-auth/oidc/exchange",
    );
    expect(exchangeInit.headers["authorization"]).toBe(
      "Bearer eyJ.github.fresh",
    );
    expect(JSON.parse(exchangeInit.body)).toEqual({ project: "acme/web" });
  });

  it("mints a fresh GitHub Actions OIDC JWT when retrying a transient exchange failure", async () => {
    mocks.meticulousFetch
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", { value: "eyJ.github.attempt-1" }),
      )
      .mockResolvedValueOnce(
        fakeResponse(503, "Service Unavailable", {
          message: "Temporary upstream failure",
        }),
      )
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", { value: "eyJ.github.attempt-2" }),
      )
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", {
          accessToken: "wfat-github-retry",
          expiresAt: "2026-11-27T13:00:00.000Z",
        }),
      );

    const result = await resolveCiOidcAccessToken({
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://gh.example/idtoken",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gh-runtime-bearer",
      },
    });

    expect(result.accessToken).toBe("wfat-github-retry");
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(4);
    const [, firstExchangeInit] = mocks.meticulousFetch.mock.calls[1] as [
      string,
      { headers: Record<string, string> },
    ];
    const [, secondExchangeInit] = mocks.meticulousFetch.mock.calls[3] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(firstExchangeInit.headers["authorization"]).toBe(
      "Bearer eyJ.github.attempt-1",
    );
    expect(secondExchangeInit.headers["authorization"]).toBe(
      "Bearer eyJ.github.attempt-2",
    );
  });

  it("detects OIDC env availability accurately", () => {
    expect(hasGitHubActionsOidcEnv({})).toBe(false);
    expect(
      hasGitHubActionsOidcEnv({
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://gh.example",
      }),
    ).toBe(false);
    expect(
      hasGitHubActionsOidcEnv({
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://gh.example",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "secret",
      }),
    ).toBe(true);
    expect(hasCiOidcEnv({ METICULOUS_OIDC_TOKEN: "eyJ.gitlab" })).toBe(true);
  });
});

describe("resolveAuthToken CI OIDC integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCiOidcTokenCache();
    vi.stubEnv("METICULOUS_API_URL", "https://api.test.meticulous.ai/api/");
    vi.stubEnv("METICULOUS_API_TOKEN", "");
    vi.stubEnv("METICULOUS_OIDC_TOKEN", "");
    vi.stubEnv("METICULOUS_PROJECT", "");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "");
    mocks.resolveOAuthAccessToken.mockResolvedValue({
      accessToken: null,
      reason: { kind: "not-logged-in" },
    });
    mocks.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    clearCiOidcTokenCache();
    vi.unstubAllEnvs();
  });

  it("caches the exchanged token so single-use METICULOUS_OIDC_TOKEN is never re-exchanged", async () => {
    vi.stubEnv("METICULOUS_OIDC_TOKEN", "eyJ.single-use-gitlab");
    const futureExpiry = new Date(Date.now() + 45 * 60_000).toISOString();
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", {
        accessToken: "wfat-cached-gitlab",
        expiresAt: futureExpiry,
      }),
    );

    const [first, second] = await Promise.all([
      resolveAuthToken(null),
      resolveAuthToken(null),
    ]);
    const third = await resolveAuthToken(null);

    expect(first).toEqual({ token: "wfat-cached-gitlab" });
    expect(second).toEqual({ token: "wfat-cached-gitlab" });
    expect(third).toEqual({ token: "wfat-cached-gitlab" });
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes a cached GitHub Actions OIDC token when within the 60s expiry margin", async () => {
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://gh.example/idtoken");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "gh-runtime-bearer");

    const soonExpiry = new Date(Date.now() + 30_000).toISOString();
    const laterExpiry = new Date(Date.now() + 45 * 60_000).toISOString();

    mocks.meticulousFetch
      .mockResolvedValueOnce(fakeResponse(200, "OK", { value: "eyJ.gh-1" }))
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", {
          accessToken: "wfat-first",
          expiresAt: soonExpiry,
        }),
      )
      .mockResolvedValueOnce(fakeResponse(200, "OK", { value: "eyJ.gh-2" }))
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", {
          accessToken: "wfat-refreshed",
          expiresAt: laterExpiry,
        }),
      );

    expect(await resolveAuthToken(null)).toEqual({ token: "wfat-first" });
    expect(await resolveAuthToken(null)).toEqual({ token: "wfat-refreshed" });
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(4);
  });

  it("keeps returning the still-valid cached token if a refresh within the 60s window fails", async () => {
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://gh.example/idtoken");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "gh-runtime-bearer");

    const soonExpiry = new Date(Date.now() + 30_000).toISOString();

    mocks.meticulousFetch
      .mockResolvedValueOnce(fakeResponse(200, "OK", { value: "eyJ.gh-1" }))
      .mockResolvedValueOnce(
        fakeResponse(200, "OK", {
          accessToken: "wfat-still-valid",
          expiresAt: soonExpiry,
        }),
      )
      .mockResolvedValueOnce(
        fakeResponse(403, "Forbidden", {
          message: "Temporary GitHub OIDC failure",
        }),
      );

    expect(await resolveAuthToken(null)).toEqual({
      token: "wfat-still-valid",
    });
    expect(await resolveAuthToken(null)).toEqual({
      token: "wfat-still-valid",
    });
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(3);
  });

  it("prefers METICULOUS_API_TOKEN over CI OIDC env vars without calling exchange", async () => {
    vi.stubEnv("METICULOUS_API_TOKEN", "static-api-token");
    vi.stubEnv("METICULOUS_OIDC_TOKEN", "eyJ.unused");

    expect(await resolveAuthToken(null)).toEqual({ token: "static-api-token" });
    expect(mocks.meticulousFetch).not.toHaveBeenCalled();
  });

  it("returns ci-oidc-failed missingReason with the backend rejection when exchange fails", async () => {
    vi.stubEnv("METICULOUS_OIDC_TOKEN", "eyJ.rejected");
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(403, "Forbidden", {
        message:
          "CI OIDC authentication is not enabled for this project, or the token is not accepted.",
      }),
    );

    const resolution = await resolveAuthToken(null);

    expect(resolution.token).toBeNull();
    expect(resolution.token === null && resolution.missingReason.kind).toBe(
      "ci-oidc-failed",
    );
    if (resolution.token === null) {
      const message = buildMissingCredentialsMessage(
        401,
        resolution.missingReason,
      );
      expect(message).toContain("CI OIDC authentication failed");
      expect(message).toContain(
        "CI OIDC authentication is not enabled for this project",
      );
      expect(message).toContain("CI trust policy");
    }
  });
});
