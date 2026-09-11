import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";

const TOKEN_ENDPOINT = "https://issuer.example/token";
const REVOCATION_ENDPOINT = "https://issuer.example/revoke";

const textResponse = (
  status: number,
  body: string,
  statusText = "",
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  }) as Response;

const jsonResponse = (
  status: number,
  body: unknown,
  statusText = "",
): Response => textResponse(status, JSON.stringify(body), statusText);

const discoveryResponse = ({
  omitRevocationEndpoint = false,
}: { omitRevocationEndpoint?: boolean } = {}) =>
  jsonResponse(200, {
    token_endpoint: TOKEN_ENDPOINT,
    ...(omitRevocationEndpoint
      ? {}
      : { revocation_endpoint: REVOCATION_ENDPOINT }),
  });

describe("revokeOAuthRefreshToken", () => {
  let fetchMock: MockedFunction<typeof fetch>;

  beforeEach(() => {
    // oauth-constants caches the discovery document per module instance.
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const importRevoke = async () => {
    const module = await import("../oauth-revoke");
    return module.revokeOAuthRefreshToken;
  };

  it("posts the refresh token to the discovered revocation endpoint as the public CLI client", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(jsonResponse(200, {}));
    const revoke = await importRevoke();

    await expect(revoke("refresh-1")).resolves.toEqual({ status: "revoked" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(REVOCATION_ENDPOINT);
    expect(init?.method).toBe("POST");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("client_id")).toBe("meticulous-cli");
    expect(body.get("token")).toBe("refresh-1");
    expect(body.get("token_type_hint")).toBe("refresh_token");
  });

  it("bounds discovery and revocation with a single deadline", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(jsonResponse(200, {}));
    const revoke = await importRevoke();

    await revoke("refresh-1");

    const discoverySignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(discoverySignal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(discoverySignal);
  });

  it("reports a failed discovery request as a failure without throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(503, "", "Service Unavailable"),
    );
    const revoke = await importRevoke();

    const result = await revoke("refresh-1");

    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.reason).toContain(
      "OpenID configuration",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a timed-out discovery request as a failure without throwing", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("The operation was aborted due to timeout"),
    );
    const revoke = await importRevoke();

    await expect(revoke("refresh-1")).resolves.toEqual({
      status: "failed",
      reason: "The operation was aborted due to timeout",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 200 carrying an error body as revoked (RFC 7009 answers 200 for an unknown token)", async () => {
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockResolvedValueOnce(
      jsonResponse(200, {
        error: "invalid_token",
        error_description: "Invalid token",
      }),
    );
    const revoke = await importRevoke();

    await expect(revoke("already-gone")).resolves.toEqual({
      status: "revoked",
    });
  });

  it("reports a non-2xx response as a failure without throwing", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(jsonResponse(401, {}, "Unauthorized"));
    const revoke = await importRevoke();

    await expect(revoke("refresh-1")).resolves.toEqual({
      status: "failed",
      reason: "401 Unauthorized",
    });
  });

  it("includes the OAuth error from a non-2xx body in the reason", async () => {
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockResolvedValueOnce(
      jsonResponse(401, {
        error: "invalid_client",
        error_description: "Invalid client credentials",
      }),
    );
    const revoke = await importRevoke();

    await expect(revoke("refresh-1")).resolves.toEqual({
      status: "failed",
      reason: "401: invalid_client: Invalid client credentials",
    });
  });

  it("falls back to a truncated body when a non-2xx response is not JSON", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        textResponse(502, `<html>${"x".repeat(500)}</html>`, "Bad Gateway"),
      );
    const revoke = await importRevoke();

    const result = await revoke("refresh-1");

    expect(result.status === "failed" && result.reason).toMatch(
      /^502 Bad Gateway: <html>x+…$/,
    );
    expect(result.status === "failed" && result.reason.length).toBeLessThan(
      250,
    );
  });

  it("reports a discovery document without a revocation endpoint as a failure without throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      discoveryResponse({ omitRevocationEndpoint: true }),
    );
    const revoke = await importRevoke();

    const result = await revoke("refresh-1");

    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.reason).toContain(
      "revocation_endpoint",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a network error as a failure without throwing", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const revoke = await importRevoke();

    await expect(revoke("refresh-1")).resolves.toEqual({
      status: "failed",
      reason: "connect ECONNREFUSED",
    });
  });
});
