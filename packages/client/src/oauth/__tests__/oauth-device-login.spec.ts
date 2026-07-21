import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
import { generateCodeChallenge } from "../oauth-pkce";

// Real performDeviceLogin() calls storeOAuthTokens() on success, which writes
// to ~/.meticulous/oauth-tokens.json. Mock it so the success-path tests below
// can't overwrite a developer's real login or fail with EPERM in locked-down CI.
vi.mock("../oauth-token-store", () => ({
  storeOAuthTokens: vi.fn(),
}));

const DEVICE_AUTHORIZATION_ENDPOINT = "https://issuer.example/device";
const TOKEN_ENDPOINT = "https://issuer.example/token";

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  }) as Response;

const discoveryResponse = ({
  omitDeviceAuthorizationEndpoint = false,
}: { omitDeviceAuthorizationEndpoint?: boolean } = {}) =>
  jsonResponse(200, {
    token_endpoint: TOKEN_ENDPOINT,
    ...(omitDeviceAuthorizationEndpoint
      ? {}
      : { device_authorization_endpoint: DEVICE_AUTHORIZATION_ENDPOINT }),
  });

const deviceAuthorizationResponse = ({
  interval,
  expiresIn = 600,
}: { interval?: number; expiresIn?: number } = {}) =>
  jsonResponse(200, {
    device_code: "device-code-1",
    user_code: "ABCD-EFGH",
    verification_uri: DEVICE_AUTHORIZATION_ENDPOINT,
    expires_in: expiresIn,
    ...(interval !== undefined ? { interval } : {}),
  });

describe("performDeviceLogin", () => {
  let fetchMock: MockedFunction<typeof fetch>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const importPerformDeviceLogin = async () => {
    const module = await import("../oauth-device-login");
    return module.performDeviceLogin;
  };

  it("succeeds after a couple of pending polls", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 300,
          id_token: "id-1",
        }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    const tokens = await resultPromise;

    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.idToken).toBe("id-1");
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const deviceAuthCall = fetchMock.mock.calls[1];
    expect(deviceAuthCall?.[0]).toBe(DEVICE_AUTHORIZATION_ENDPOINT);
    const deviceAuthBody = new URLSearchParams(
      deviceAuthCall?.[1]?.body as string,
    );
    const codeChallenge = deviceAuthBody.get("code_challenge");
    expect(codeChallenge).toBeTruthy();
    expect(deviceAuthBody.get("code_challenge_method")).toBe("S256");

    const tokenCall = fetchMock.mock.calls[2];
    expect(tokenCall?.[0]).toBe(TOKEN_ENDPOINT);
    const tokenCallBody = new URLSearchParams(tokenCall?.[1]?.body as string);
    expect(tokenCallBody.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:device_code",
    );
    const codeVerifier = tokenCallBody.get("code_verifier");
    expect(codeVerifier).toBeTruthy();
    expect(generateCodeChallenge(codeVerifier ?? "")).toBe(codeChallenge);
  });

  it("increases the interval by 5s on slow_down and keeps polling", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "slow_down" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: 300,
        }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();

    // First poll fires at t=5s (the initial interval) and returns slow_down,
    // bumping the interval to 10s.
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // A poll at the old 5s cadence (t=10s) must NOT have fired yet, since the
    // interval grew to 10s after the slow_down response.
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The next poll happens once the full 10s interval has elapsed (t=15s).
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const tokens = await resultPromise;
    expect(tokens.accessToken).toBe("access-2");
  });

  it("does not grow the interval on authorization_pending", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-3",
          refresh_token: "refresh-3",
          expires_in: 300,
        }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();

    // First poll fires at t=5s (the initial interval) and returns pending.
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // A poll at t=9s must NOT have fired yet, since a pending response leaves
    // the 5s interval unchanged (unlike slow_down, which grows it).
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The next poll happens once the unchanged 5s interval has elapsed (t=10s).
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const tokens = await resultPromise;
    expect(tokens.accessToken).toBe("access-3");
  });

  it("throws a clear error when the user denies the login", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "access_denied" }));

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();
    const expectation =
      expect(resultPromise).rejects.toThrow("Login was denied.");

    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });

  it("throws a clear error when the server reports the device code expired", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "expired_token" }));

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();
    const expectation = expect(resultPromise).rejects.toThrow(
      "Device code expired, run login again.",
    );

    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });

  it("makes a final poll at the deadline before giving up locally", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        deviceAuthorizationResponse({ interval: 5, expiresIn: 8 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "authorization_pending" }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();
    const expectation = expect(resultPromise).rejects.toThrow(
      "Device code expired, run login again.",
    );

    // First poll at t=5s: still within the 8s deadline.
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Remaining lifetime is 3s, so the sleep is capped to that instead of the
    // full 5s interval, and a final poll fires right at the t=8s deadline.
    await vi.advanceTimersByTimeAsync(3000);
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("succeeds when approval arrives after the last pending poll but before expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        deviceAuthorizationResponse({ interval: 5, expiresIn: 8 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "authorization_pending" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-late",
          refresh_token: "refresh-late",
          expires_in: 300,
        }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(3000);

    const tokens = await resultPromise;
    expect(tokens.accessToken).toBe("access-late");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws a clear error when the device authorization grant is not enabled on the realm", async () => {
    fetchMock.mockResolvedValueOnce(
      discoveryResponse({ omitDeviceAuthorizationEndpoint: true }),
    );

    const performDeviceLogin = await importPerformDeviceLogin();

    await expect(performDeviceLogin()).rejects.toThrow(
      /device_authorization_endpoint/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when Keycloak rejects the client as unauthorized for the device grant", async () => {
    // Verified against a real Keycloak 26.2.5: discovery still advertises
    // `device_authorization_endpoint` even when the grant is disabled on this
    // specific client (it's realm-level, not per-client) — Keycloak instead
    // rejects the device-authorization POST itself with `unauthorized_client`.
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockResolvedValueOnce(
      jsonResponse(400, {
        error: "unauthorized_client",
        error_description:
          "Client is not allowed to initiate OAuth 2.0 Device Authorization Grant. The flow is disabled for the client.",
      }),
    );

    const performDeviceLogin = await importPerformDeviceLogin();

    await expect(performDeviceLogin()).rejects.toThrow(
      /not enabled for the meticulous-cli client/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error when the device authorization response is missing expires_in", async () => {
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockResolvedValueOnce(
      jsonResponse(200, {
        device_code: "device-code-1",
        user_code: "ABCD-EFGH",
        verification_uri: DEVICE_AUTHORIZATION_ENDPOINT,
        // expires_in omitted
      }),
    );

    const performDeviceLogin = await importPerformDeviceLogin();

    await expect(performDeviceLogin()).rejects.toThrow(/expires_in/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error when the device authorization response is missing user_code", async () => {
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockResolvedValueOnce(
      jsonResponse(200, {
        device_code: "device-code-1",
        verification_uri: DEVICE_AUTHORIZATION_ENDPOINT,
        expires_in: 600,
      }),
    );

    const performDeviceLogin = await importPerformDeviceLogin();

    await expect(performDeviceLogin()).rejects.toThrow(/user_code/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tolerates a transient network error while polling and keeps going", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-4",
          refresh_token: "refresh-4",
          expires_in: 300,
        }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();

    // The network error at t=5s doesn't grow the interval or abort the flow,
    // so the next poll still fires at the unchanged 5s cadence (t=10s).
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const tokens = await resultPromise;
    expect(tokens.accessToken).toBe("access-4");
  });

  it("tolerates a transient 5xx from the token endpoint and keeps polling", async () => {
    fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(deviceAuthorizationResponse({ interval: 5 }))
      .mockResolvedValueOnce(jsonResponse(503, "Service Unavailable"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-5",
          refresh_token: "refresh-5",
          expires_in: 300,
        }),
      );

    const performDeviceLogin = await importPerformDeviceLogin();
    const resultPromise = performDeviceLogin();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const tokens = await resultPromise;
    expect(tokens.accessToken).toBe("access-5");
  });
});
