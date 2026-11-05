import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ApiTokenUtils from "../api-token.utils";
import { buildClient, createClient } from "../client";
import { maybeEnrichFetchError } from "../errors";
import {
  isMissingCredentialsError,
  MISSING_AUTH_GUIDANCE,
  MissingCredentialsError,
} from "../missing-credentials";
import { EXPIRED_JWT, fakeResponse, VALID_JWT } from "./fake-fetch";

const mocks = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
  getApiToken: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    meticulousFetch: (...args: unknown[]) => mocks.meticulousFetch(...args),
  };
});

vi.mock("../oauth/oauth-token-store", () => ({
  getStoredOAuthTokens: () => mocks.getStoredOAuthTokens(),
}));

vi.mock("../api-token.utils", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiTokenUtils>();
  return {
    ...actual,
    getApiToken: (apiToken: string | null | undefined) =>
      mocks.getApiToken(apiToken),
  };
});

const logger = { debug: () => {} } as never;

const storedLogin = (accessToken: string) => ({
  accessToken,
  refreshToken: "r",
  expiresAt: 0,
});

const failWith = (status: number) =>
  mocks.meticulousFetch.mockResolvedValue(
    fakeResponse(status, status === 401 ? "Unauthorized" : "Forbidden", {
      message: status === 401 ? "Unauthorized" : "Forbidden",
    }),
  );

const SENT_WITHOUT_CREDENTIALS =
  "Authentication failed (HTTP 401): the request was sent without credentials. ";

describe("buildClient requests sent without credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStoredOAuthTokens.mockReturnValue(null);
    mocks.getApiToken.mockReturnValue(null);
    failWith(401);
  });

  it("says no login and no API token is set when nothing is stored", async () => {
    const caught = await buildClient(null, logger)
      .get("a")
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(MissingCredentialsError);
    expect((caught as MissingCredentialsError).missingReason).toEqual({
      kind: "not-logged-in",
    });
    expect((caught as Error).message).toBe(
      SENT_WITHOUT_CREDENTIALS +
        "You are not logged in, and no API token is set.\n" +
        MISSING_AUTH_GUIDANCE,
    );
  });

  it("says a stored, expired login could not be renewed and asks to retry", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(storedLogin(EXPIRED_JWT));

    const caught = await buildClient(null, logger)
      .get("a")
      .catch((error: unknown) => error);

    expect((caught as MissingCredentialsError).missingReason).toEqual({
      kind: "login-not-renewed",
    });
    expect((caught as Error).message).toBe(
      SENT_WITHOUT_CREDENTIALS +
        "Your Meticulous login has expired and could not be renewed, and no " +
        "API token is set. Your login has been kept.\n" +
        "Re-run the command to retry; if this keeps happening, run " +
        "`meticulous auth login` to log in again. If this command " +
        "authenticates with an API token only, pass --apiToken or set " +
        "METICULOUS_API_TOKEN instead.",
    );
  });

  it("says a stored, valid login is not used by an API-token-only client", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(storedLogin(VALID_JWT));

    const caught = await createClient({ apiToken: null })
      .get("a")
      .catch((error: unknown) => error);

    expect((caught as MissingCredentialsError).missingReason).toEqual({
      kind: "login-not-used",
    });
    expect((caught as Error).message).toBe(
      SENT_WITHOUT_CREDENTIALS +
        "This command authenticates with an API token only, so it does not " +
        "use your Meticulous login, and no API token was passed or found in " +
        "METICULOUS_API_TOKEN or the Meticulous config file.\n" +
        "Pass --apiToken or set METICULOUS_API_TOKEN.",
    );
  });

  it("reads the stored login when the request fails, not when the client is created", async () => {
    const client = createClient({ apiToken: null });
    mocks.getStoredOAuthTokens.mockReturnValue(storedLogin(EXPIRED_JWT));

    const caught = await client.get("a").catch((error: unknown) => error);

    expect((caught as MissingCredentialsError).missingReason).toEqual({
      kind: "login-not-renewed",
    });
  });

  it("treats an unreadable stored login as not logged in", async () => {
    mocks.getStoredOAuthTokens.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const caught = await buildClient(null, logger)
      .get("a")
      .catch((error: unknown) => error);

    expect((caught as MissingCredentialsError).missingReason).toEqual({
      kind: "not-logged-in",
    });
  });

  it("does not read the stored login for a failure that is not a 401/403", async () => {
    failWith(404);

    const caught = await buildClient(null, logger)
      .get("a")
      .catch((error: unknown) => error);

    expect(isMissingCredentialsError(caught)).toBe(false);
    expect(mocks.getStoredOAuthTokens).not.toHaveBeenCalled();
  });

  it("uses the missing-credential reason a token provider reports", async () => {
    mocks.getStoredOAuthTokens.mockReturnValue(storedLogin(VALID_JWT));
    const client = buildClient(
      () =>
        Promise.resolve({
          token: null,
          missingReason: { kind: "refresh-failed", detail: "fetch failed" },
        }),
      logger,
    );

    const caught = await client.get("a").catch((error: unknown) => error);

    expect((caught as MissingCredentialsError).missingReason).toEqual({
      kind: "refresh-failed",
      detail: "fetch failed",
    });
    expect((caught as Error).message).toMatch(
      /refreshing it failed \(fetch failed\)\. Your login has been kept\.\nRe-run the command to retry/,
    );
  });

  it("keeps the missing-credential explanation through maybeEnrichFetchError", async () => {
    const caught = await buildClient(null, logger)
      .get("a")
      .catch((error: unknown) => maybeEnrichFetchError(error));

    expect((caught as Error).message).toMatch(/sent without credentials/);
  });

  it("explains the 403 the backend sends a request without credentials", async () => {
    failWith(403);

    await expect(buildClient(null, logger).get("a")).rejects.toThrow(
      /HTTP 403\): the request was sent without credentials\. You are not logged in/,
    );
  });
});
