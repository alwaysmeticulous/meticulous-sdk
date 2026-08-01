import { describe, expect, it } from "vitest";
import { redactRequestBody, STR_REDACTED } from "../redact-body";

describe("redactRequestBody", () => {
  it("redacts a secret field while leaving the rest of the body usable", () => {
    const redacted = redactRequestBody(
      JSON.stringify({ clientSecret: "abc123", flags: ["a", "b"] }),
    );
    expect(JSON.parse(redacted)).toEqual({
      clientSecret: STR_REDACTED,
      flags: ["a", "b"],
    });
  });

  it("matches secret keys regardless of case, underscores or dashes", () => {
    const redacted = redactRequestBody(
      JSON.stringify({
        client_secret: "a",
        "CLIENT-SECRET": "b",
        clientSecret: "c",
        apiKey: "d",
        api_key: "e",
        accessToken: "f",
        refresh_token: "g",
        Password: "h",
        privateKey: "i",
      }),
    );
    const parsed = JSON.parse(redacted) as Record<string, string>;
    expect(Object.values(parsed)).toEqual(
      Array.from({ length: 9 }, () => STR_REDACTED),
    );
  });

  it("redacts nested objects and objects inside arrays", () => {
    const redacted = redactRequestBody(
      JSON.stringify({
        outer: { inner: { token: "secret", keep: "visible" } },
        list: [{ password: "secret" }, { keep: "visible" }],
      }),
    );
    expect(JSON.parse(redacted)).toEqual({
      outer: { inner: { token: STR_REDACTED, keep: "visible" } },
      list: [{ password: STR_REDACTED }, { keep: "visible" }],
    });
  });

  it("does not redact a key that merely contains a secret word", () => {
    const redacted = redactRequestBody(
      JSON.stringify({ tokenCount: 12, secretary: "sam" }),
    );
    expect(JSON.parse(redacted)).toEqual({ tokenCount: 12, secretary: "sam" });
  });

  it("leaves non-JSON bodies untouched", () => {
    expect(redactRequestBody("client_secret=abc&grant_type=x")).toBe(
      "client_secret=abc&grant_type=x",
    );
    expect(redactRequestBody("not json at all")).toBe("not json at all");
    expect(redactRequestBody("")).toBe("");
  });

  it("preserves non-object JSON values", () => {
    expect(redactRequestBody('"just a string"')).toBe('"just a string"');
    expect(redactRequestBody("42")).toBe("42");
    expect(redactRequestBody("null")).toBe("null");
  });

  it("is stable, so a redacted body still keys identically on both sides", () => {
    const body = JSON.stringify({ token: "one", flags: ["a"] });
    expect(redactRequestBody(body)).toBe(redactRequestBody(body));
    // And redacting an already-redacted body is a no-op.
    expect(redactRequestBody(redactRequestBody(body))).toBe(
      redactRequestBody(body),
    );
  });
});
