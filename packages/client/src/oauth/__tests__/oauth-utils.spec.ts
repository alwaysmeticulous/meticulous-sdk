import { afterEach, describe, expect, it, vi } from "vitest";
import { getJwtClaims, isJwtExpired, isOAuthJwt } from "../oauth-utils";

const makeJwt = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // Signature segment is opaque to client-side utilities; any non-empty
  // string is fine here.
  return `${header}.${body}.sig`;
};

describe("isOAuthJwt", () => {
  it("returns true for a well-formed 3-segment JWT", () => {
    expect(isOAuthJwt(makeJwt({ sub: "abc" }))).toBe(true);
  });

  it("returns false for an empty token", () => {
    expect(isOAuthJwt("")).toBe(false);
  });

  it("returns false for a project-scoped API token (prat- prefix)", () => {
    // Even with a JWT-like shape, the prefix must short-circuit.
    expect(isOAuthJwt("prat-abc.def.ghi")).toBe(false);
    expect(isOAuthJwt("prat-opaque-token")).toBe(false);
  });

  it("returns false for a test-run API token (trat prefix)", () => {
    expect(isOAuthJwt("trat-abc.def.ghi")).toBe(false);
    expect(isOAuthJwt("trat_opaque")).toBe(false);
  });

  it("returns false when there are not exactly 3 segments", () => {
    expect(isOAuthJwt("a.b")).toBe(false);
    expect(isOAuthJwt("a.b.c.d")).toBe(false);
    expect(isOAuthJwt("nodots")).toBe(false);
  });

  it("returns false when any segment is empty", () => {
    expect(isOAuthJwt("a..c")).toBe(false);
    expect(isOAuthJwt(".b.c")).toBe(false);
    expect(isOAuthJwt("a.b.")).toBe(false);
  });
});

describe("getJwtClaims", () => {
  it("decodes the payload of a well-formed JWT", () => {
    const claims = getJwtClaims(makeJwt({ sub: "user-1", role: "owner" }));
    expect(claims).toEqual({ sub: "user-1", role: "owner" });
  });

  it("returns null for a token with the wrong number of segments", () => {
    expect(getJwtClaims("a.b")).toBeNull();
    expect(getJwtClaims("no-dots")).toBeNull();
  });

  it("returns null when the payload is not valid JSON", () => {
    const garbledPayload = Buffer.from("not-json").toString("base64url");
    expect(getJwtClaims(`h.${garbledPayload}.s`)).toBeNull();
  });
});

describe("isJwtExpired", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when exp is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const expSecondsAgo = Math.floor(Date.now() / 1000) - 60;
    expect(isJwtExpired(makeJwt({ exp: expSecondsAgo }))).toBe(true);
  });

  it("returns false when exp is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const expInFuture = Math.floor(Date.now() / 1000) + 60;
    expect(isJwtExpired(makeJwt({ exp: expInFuture }))).toBe(false);
  });

  it("returns false when the token has no exp claim", () => {
    expect(isJwtExpired(makeJwt({ sub: "x" }))).toBe(false);
  });

  it("returns false when the token is malformed (no evidence of expiry)", () => {
    expect(isJwtExpired("not-a-jwt")).toBe(false);
  });
});
