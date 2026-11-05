import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClient } from "../client";
import { maybeEnrichFetchError } from "../errors";
import {
  isRejectedCredentialsError,
  RejectedCredentialsError,
} from "../rejected-credentials";
import { fakeResponse, VALID_JWT } from "./fake-fetch";

const mocks = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
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

const logger = { debug: () => {} } as never;

const failWith = (status: number, statusText: string, message: string) =>
  mocks.meticulousFetch.mockResolvedValue(
    fakeResponse(status, statusText, { message }),
  );

const requestError = (token: string): Promise<unknown> =>
  buildClient(token, logger)
    .get("agent/whoami")
    .catch((error: unknown) => error);

describe("buildClient requests that carried a credential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStoredOAuthTokens.mockReturnValue(null);
  });

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])(
    "tags a %i for an OAuth JWT as a rejected login",
    async (status, statusText) => {
      failWith(status, statusText, "audience mismatch");

      const caught = await requestError(VALID_JWT);

      expect(caught).toBeInstanceOf(RejectedCredentialsError);
      expect((caught as RejectedCredentialsError).credentialKind).toBe(
        "oauth-login",
      );
      expect((caught as RejectedCredentialsError).response?.status).toBe(
        status,
      );
    },
  );

  it.each(["prat-abc", "wfat-abc", "legacy-token"])(
    "tags a 401 for %s as a rejected API token",
    async (token) => {
      failWith(401, "Unauthorized", "Unauthorized");

      const caught = await requestError(token);

      expect((caught as RejectedCredentialsError).credentialKind).toBe(
        "api-token",
      );
    },
  );

  it("keeps the message maybeEnrichFetchError would have produced", async () => {
    failWith(403, "Forbidden", "No access to this project");

    const caught = await requestError("prat-abc");

    expect((caught as Error).message).toMatch(
      /^No access to this project\n\nGET .*\/agent\/whoami returned 403 Forbidden \(\{"message":"No access to this project"\}\)\)$/,
    );
    const plain = Object.assign(new Error("HTTP 403: Forbidden"), {
      response: (caught as RejectedCredentialsError).response,
      config: (caught as RejectedCredentialsError).config,
    });
    expect((caught as Error).message).toBe(
      maybeEnrichFetchError(plain).message,
    );
  });

  it("is left unchanged by maybeEnrichFetchError", async () => {
    failWith(401, "Unauthorized", "Unauthorized");

    const caught = await requestError("prat-abc");

    expect(maybeEnrichFetchError(caught)).toBe(caught);
  });

  it("does not tag a failure that is not a 401/403", async () => {
    failWith(404, "Not Found", "Not found");

    const caught = await requestError("prat-abc");

    expect(caught).toBeInstanceOf(Error);
    expect(isRejectedCredentialsError(caught)).toBe(false);
    expect((caught as Error).message).toBe("HTTP 404: Not Found");
  });

  it("does not consult the stored login", async () => {
    failWith(401, "Unauthorized", "Unauthorized");

    await requestError("prat-abc");

    expect(mocks.getStoredOAuthTokens).not.toHaveBeenCalled();
  });
});

describe("isRejectedCredentialsError", () => {
  it("recognises an error from another copy of the package by name and kind", () => {
    const foreign = Object.assign(new Error("Unauthorized"), {
      name: "RejectedCredentialsError",
      credentialKind: "api-token",
    });

    expect(isRejectedCredentialsError(foreign)).toBe(true);
  });

  it.each([
    ["a plain error", new Error("x")],
    [
      "a same-named error without a credential kind",
      Object.assign(new Error("x"), { name: "RejectedCredentialsError" }),
    ],
    [
      "a non-error object",
      { name: "RejectedCredentialsError", credentialKind: "api-token" },
    ],
  ])("rejects %s", (_name, value) => {
    expect(isRejectedCredentialsError(value)).toBe(false);
  });
});
