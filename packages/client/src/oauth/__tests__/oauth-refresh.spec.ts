import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
import type * as Common from "@alwaysmeticulous/common";
import type { StoredOAuthTokens } from "../oauth-token-store";

// Never touch the real ~/.meticulous/oauth-tokens.json: a failed refresh in the
// real store would delete a developer's login.
const mocks = vi.hoisted(() => ({
  getStoredOAuthTokens: vi.fn(),
  storeOAuthTokens: vi.fn(),
  clearOAuthTokens: vi.fn(),
}));

const logMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("../oauth-token-store", () => mocks);

vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  initLogger: () => ({ warn: logMocks.warn, info: vi.fn(), debug: vi.fn() }),
  logNotice: logMocks.logNotice,
}));

const TOKEN_ENDPOINT = "https://issuer.example/token";

const textResponse = (status: number, body: string): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  }) as Response;

const jsonResponse = (status: number, body: unknown): Response =>
  textResponse(status, JSON.stringify(body));

const discoveryResponse = () =>
  jsonResponse(200, { token_endpoint: TOKEN_ENDPOINT });

const nowSeconds = () => Math.floor(Date.now() / 1000);

const expiredTokens = (
  overrides: Partial<StoredOAuthTokens> = {},
): StoredOAuthTokens => ({
  accessToken: "old-access",
  refreshToken: "refresh-1",
  expiresAt: nowSeconds() - 60,
  idToken: "old-id",
  ...overrides,
});

describe("getValidAccessToken", () => {
  let fetchMock: MockedFunction<typeof fetch>;

  beforeEach(() => {
    // oauth-constants caches the discovery document per module instance.
    vi.resetModules();
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const importGetValidAccessToken = async () => {
    const module = await import("../oauth-refresh");
    return module.getValidAccessToken;
  };

  const mockRefreshResponse = (response: Response) => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(response);
  };

  it("returns null without refreshing when no tokens are stored", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a fresh access token without refreshing", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(
      expiredTokens({ expiresAt: nowSeconds() + 3600 }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBe("old-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears tokens that have no refresh token", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(
      expiredTokens({ refreshToken: "" }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mocks.clearOAuthTokens).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores and returns the refreshed tokens", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    mockRefreshResponse(
      jsonResponse(200, {
        access_token: "new-access",
        refresh_token: "refresh-2",
        expires_in: 300,
        id_token: "new-id",
      }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBe("new-access");

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(TOKEN_ENDPOINT);
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("meticulous-cli");
    expect(body.get("refresh_token")).toBe("refresh-1");

    const [stored] = mocks.storeOAuthTokens.mock.calls[0] as [
      StoredOAuthTokens,
    ];
    expect(stored).toMatchObject({
      accessToken: "new-access",
      refreshToken: "refresh-2",
      idToken: "new-id",
    });
    expect(stored.expiresAt).toBeCloseTo(nowSeconds() + 300, -1);
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("keeps the old refresh token when the response does not rotate it", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    mockRefreshResponse(
      jsonResponse(200, { access_token: "new-access", expires_in: 300 }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBe("new-access");
    expect(mocks.storeOAuthTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: "refresh-1",
        idToken: "old-id",
      }),
    );
  });

  it.each([
    ["400 invalid_grant", 400, { error: "invalid_grant" }],
    ["400 invalid_client", 400, { error: "invalid_client" }],
    ["400 invalid_request", 400, { error: "invalid_request" }],
    ["400 unauthorized_client", 400, { error: "unauthorized_client" }],
    ["400 unsupported_grant_type", 400, { error: "unsupported_grant_type" }],
    ["400 invalid_scope", 400, { error: "invalid_scope" }],
    ["401 invalid_client", 401, { error: "invalid_client" }],
  ])(
    "clears tokens when the server rejects the refresh (%s)",
    async (_name, status, body) => {
      mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
      mockRefreshResponse(jsonResponse(status, body));
      const getValidAccessToken = await importGetValidAccessToken();

      await expect(getValidAccessToken()).resolves.toBeNull();
      expect(mocks.clearOAuthTokens).toHaveBeenCalledTimes(1);
      expect(mocks.storeOAuthTokens).not.toHaveBeenCalled();
      expect(logMocks.logNotice).toHaveBeenCalledWith(
        expect.stringContaining("meticulous auth login"),
      );
      expect(logMocks.warn).not.toHaveBeenCalled();
    },
  );

  it("includes the OAuth error description in the rejection notice", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    mockRefreshResponse(
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "Session not active",
      }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(logMocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining("HTTP 400: invalid_grant (Session not active)"),
    );
  });

  it("keeps a login another process refreshed while this refresh was rejected", async () => {
    mocks.getStoredOAuthTokens
      .mockReturnValueOnce(expiredTokens())
      .mockReturnValueOnce(
        expiredTokens({
          accessToken: "other-process-access",
          refreshToken: "refresh-2",
          expiresAt: nowSeconds() + 300,
        }),
      );
    mockRefreshResponse(jsonResponse(400, { error: "invalid_grant" }));
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBe("other-process-access");
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("uses another process's rotated login while it is inside the expiry buffer", async () => {
    mocks.getStoredOAuthTokens
      .mockReturnValueOnce(expiredTokens())
      .mockReturnValueOnce(
        expiredTokens({
          accessToken: "other-process-access",
          refreshToken: "refresh-2",
          expiresAt: nowSeconds() + 10,
        }),
      );
    mockRefreshResponse(jsonResponse(400, { error: "invalid_grant" }));
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBe("other-process-access");
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
    expect(logMocks.logNotice).not.toHaveBeenCalled();
  });

  it("shares one refresh between concurrent callers", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    mockRefreshResponse(
      jsonResponse(200, { access_token: "new-access", expires_in: 300 }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(
      Promise.all([getValidAccessToken(), getValidAccessToken()]),
    ).resolves.toEqual(["new-access", "new-access"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.storeOAuthTokens).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["500", textResponse(500, "")],
    ["503 with an HTML body", textResponse(503, "<html>Bad gateway</html>")],
    ["429", jsonResponse(429, { error: "slow_down" })],
    ["401 without an OAuth error body", jsonResponse(401, {})],
    ["401 with an HTML body", textResponse(401, "<html>Unauthorized</html>")],
    [
      "400 with an error outside RFC 6749 §5.2",
      jsonResponse(400, { error: "temporarily_unavailable" }),
    ],
    ["400 with a non-JSON body", textResponse(400, "Bad Request")],
    ["200 with a non-JSON body", textResponse(200, "<html></html>")],
    ["200 without an access token", jsonResponse(200, { expires_in: 300 })],
  ])(
    "keeps tokens when the refresh fails transiently (%s)",
    async (_name, response) => {
      mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
      mockRefreshResponse(response);
      const getValidAccessToken = await importGetValidAccessToken();

      await expect(getValidAccessToken()).resolves.toBeNull();
      expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
      expect(mocks.storeOAuthTokens).not.toHaveBeenCalled();
      expect(logMocks.warn).toHaveBeenCalledTimes(1);
      expect(logMocks.logNotice).not.toHaveBeenCalled();
    },
  );

  it("keeps tokens when the token request throws a network error", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockRejectedValueOnce(
      new TypeError("fetch failed", {
        cause: new Error("getaddrinfo ENOTFOUND issuer.example"),
      }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
    expect(logMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "fetch failed (getaddrinfo ENOTFOUND issuer.example)",
      ),
    );
  });

  it("returns the still-valid access token when a refresh inside the expiry buffer fails", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(
      expiredTokens({ expiresAt: nowSeconds() + 10 }),
    );
    mockRefreshResponse(textResponse(503, ""));
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBe("old-access");
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
    expect(logMocks.warn).not.toHaveBeenCalled();
  });

  it("returns null and warns when the refresh of an expired access token fails", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    mockRefreshResponse(textResponse(503, ""));
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(logMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("HTTP 503"),
    );
  });

  it("warns about a failed refresh only once per process", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValue(textResponse(503, ""));
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logMocks.warn).toHaveBeenCalledTimes(1);
  });

  it("keeps tokens when token endpoint discovery fails", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    fetchMock.mockRejectedValueOnce(
      new Error("getaddrinfo ENOTFOUND issuer.example"),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps tokens when token endpoint discovery returns an error status", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    fetchMock.mockResolvedValueOnce(textResponse(502, ""));
    const getValidAccessToken = await importGetValidAccessToken();

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mocks.clearOAuthTokens).not.toHaveBeenCalled();
  });

  it("bounds discovery and the token request with a deadline", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(expiredTokens());
    mockRefreshResponse(
      jsonResponse(200, { access_token: "new-access", expires_in: 300 }),
    );
    const getValidAccessToken = await importGetValidAccessToken();

    await getValidAccessToken();

    const discoverySignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(discoverySignal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(discoverySignal);
  });
});
