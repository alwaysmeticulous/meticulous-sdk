import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClient } from "../client";

const { meticulousFetch } = vi.hoisted(() => ({
  meticulousFetch: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@alwaysmeticulous/common")>();
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
  json: async () => ({ ok: true }),
  text: async () => "",
});

const authHeaderOfCall = (callIndex: number): string => {
  const init = meticulousFetch.mock.calls[callIndex]?.[1] as {
    headers: Record<string, string>;
  };
  return init.headers.authorization;
};

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
});
