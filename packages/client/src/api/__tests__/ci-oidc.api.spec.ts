import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeResponse } from "../../__tests__/fake-fetch";
import { exchangeCiOidcToken } from "../ci-oidc.api";

const mocks = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
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

describe("exchangeCiOidcToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("METICULOUS_API_URL", "https://api.test.meticulous.ai/api/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts the OIDC JWT as a Bearer token and returns accessToken and expiresAt", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", {
        accessToken: "wfat-ci-oidc-token",
        expiresAt: "2026-11-27T13:00:00.000Z",
      }),
    );

    const result = await exchangeCiOidcToken({
      oidcToken: "eyJ.oidc.jwt",
      project: "acme/web",
      appInfo: "report-diffs-action/upload-assets@v1",
    });

    expect(result).toEqual({
      accessToken: "wfat-ci-oidc-token",
      expiresAt: "2026-11-27T13:00:00.000Z",
    });
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.meticulousFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      "https://api.test.meticulous.ai/api/ci-auth/oidc/exchange",
    );
    expect(init.method).toBe("POST");
    expect(init.headers["authorization"]).toBe("Bearer eyJ.oidc.jwt");
    expect(init.headers["user-agent"]).toContain(
      "report-diffs-action/upload-assets@v1",
    );
    expect(JSON.parse(init.body)).toEqual({ project: "acme/web" });
  });

  it("omits project from the request body when not provided or blank", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", {
        accessToken: "wfat-token",
        expiresAt: "2026-11-27T13:00:00.000Z",
      }),
    );

    await exchangeCiOidcToken({ oidcToken: "eyJ.oidc.jwt", project: "   " });

    const [, init] = mocks.meticulousFetch.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("rejects an empty OIDC token without making a network request", async () => {
    await expect(exchangeCiOidcToken({ oidcToken: "   " })).rejects.toThrow(
      /empty CI OIDC token/i,
    );
    expect(mocks.meticulousFetch).not.toHaveBeenCalled();
  });

  it("surfaces the backend error message verbatim on 403 and does not retry", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(403, "Forbidden", {
        message:
          "The OIDC token was rejected: the token's \"event_name\" claim does not satisfy the trust policy. Check the project's trust policy.",
      }),
    );

    await expect(
      exchangeCiOidcToken({ oidcToken: "eyJ.oidc.jwt" }),
    ).rejects.toThrow(
      /the token's "event_name" claim does not satisfy the trust policy/,
    );
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry 503 responses so a single-use OIDC JWT is never re-submitted", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(503, "Service Unavailable", {
        message: "Could not fetch the issuer's signing keys, retry shortly",
      }),
    );

    await expect(
      exchangeCiOidcToken({ oidcToken: "eyJ.oidc.jwt" }),
    ).rejects.toThrow(/Could not fetch the issuer's signing keys/);
    expect(mocks.meticulousFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed exchange responses missing accessToken", async () => {
    mocks.meticulousFetch.mockResolvedValueOnce(
      fakeResponse(200, "OK", { expiresAt: "2026-11-27T13:00:00.000Z" }),
    );

    await expect(
      exchangeCiOidcToken({ oidcToken: "eyJ.oidc.jwt" }),
    ).rejects.toThrow(/unexpected response/i);
  });
});
