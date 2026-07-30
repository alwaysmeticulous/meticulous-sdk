import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClient } from "../client";

const { meticulousFetch } = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    meticulousFetch: (...args: unknown[]) => meticulousFetch(...args),
  };
});

const okResponse = () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: {
    forEach: () => {},
    get: () => "application/json",
  },
  json: () => ({ ok: true }),
  text: () => "",
});

const authHeaderOfCall = (callIndex: number): string | undefined => {
  const init = meticulousFetch.mock.calls[callIndex]?.[1] as {
    headers: Record<string, string>;
  };
  return init.headers.authorization;
};

const unauthorizedResponse = () => ({
  ok: false,
  status: 401,
  statusText: "Unauthorized",
  headers: {
    forEach: () => {},
    get: () => "application/json",
  },
  json: () => ({ message: "Unauthorized" }),
  text: () => "",
});

const forbiddenResponse = () => ({
  ok: false,
  status: 403,
  statusText: "Forbidden",
  headers: {
    forEach: () => {},
    get: () => "application/json",
  },
  json: () => ({ message: "Forbidden" }),
  text: () => "",
});

describe("buildClient token resolution", () => {
  beforeEach(() => {
    meticulousFetch.mockReset();
    meticulousFetch.mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses a static token verbatim on every request", async () => {
    const client = buildClient("token-abc", { debug: () => {} } as never);

    await client.get("a");
    await client.get("b");

    expect(authHeaderOfCall(0)).toBe("token-abc");
    expect(authHeaderOfCall(1)).toBe("token-abc");
  });

  it("invokes a token provider on every request so a refreshed token is used", async () => {
    let counter = 0;
    const provider = () => Promise.resolve(`token-${++counter}`);
    const client = buildClient(provider, { debug: () => {} } as never);

    await client.get("a");
    await client.get("b");
    await client.get("c");

    expect(authHeaderOfCall(0)).toBe("token-1");
    expect(authHeaderOfCall(1)).toBe("token-2");
    expect(authHeaderOfCall(2)).toBe("token-3");
  });

  it("omits the Authorization header when no token is available", async () => {
    const client = buildClient(null, { debug: () => {} } as never);

    await client.get("a");

    expect(authHeaderOfCall(0)).toBeUndefined();
  });

  it("surfaces missing-auth guidance on 401 when no token was sent", async () => {
    meticulousFetch.mockResolvedValue(unauthorizedResponse());
    const client = buildClient(null, { debug: () => {} } as never);

    await expect(client.get("a")).rejects.toThrow(
      /An API token is probably missing or invalid/,
    );
  });

  it("does not rewrite 401 errors when a token was sent", async () => {
    meticulousFetch.mockResolvedValue(unauthorizedResponse());
    const client = buildClient("token-abc", { debug: () => {} } as never);

    let caught: unknown;
    try {
      await client.get("a");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/HTTP 401/);
    expect((caught as Error).message).not.toMatch(
      /An API token is probably missing or invalid/,
    );
  });

  it("surfaces wrong-credential-type guidance on 403 when no token was sent", async () => {
    meticulousFetch.mockResolvedValue(forbiddenResponse());
    const client = buildClient(null, { debug: () => {} } as never);

    await expect(client.get("a")).rejects.toThrow(
      /rejected as the wrong type for this endpoint/,
    );
  });

  it("does not rewrite 403 errors when a token was sent", async () => {
    meticulousFetch.mockResolvedValue(forbiddenResponse());
    const client = buildClient("token-abc", { debug: () => {} } as never);

    let caught: unknown;
    try {
      await client.get("a");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/HTTP 403/);
    expect((caught as Error).message).not.toMatch(
      /rejected as the wrong type for this endpoint/,
    );
  });
});
