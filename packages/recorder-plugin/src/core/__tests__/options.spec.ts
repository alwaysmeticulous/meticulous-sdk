import { describe, expect, it } from "vitest";
import { resolveOptions } from "../options";

describe("resolveOptions", () => {
  it("throws when options is undefined", () => {
    expect(() => resolveOptions(undefined)).toThrow(
      /`recordingToken` is required/,
    );
  });

  it("throws when recordingToken is missing", () => {
    // @ts-expect-error intentionally invalid input
    expect(() => resolveOptions({})).toThrow(
      /`recordingToken` is required/,
    );
  });

  it("throws when recordingToken is the empty string", () => {
    expect(() => resolveOptions({ recordingToken: "" })).toThrow(
      /`recordingToken` is required/,
    );
  });

  it("throws with the package-prefixed error message", () => {
    expect(() => resolveOptions(undefined)).toThrow(
      /^@alwaysmeticulous\/recorder-plugin:/,
    );
  });

  it("does not throw when recordingToken is missing and enabled is 'never'", () => {
    expect(() =>
      // @ts-expect-error intentionally omitting required recordingToken
      resolveOptions({ enabled: "never" }),
    ).not.toThrow();
  });

  it("applies all defaults when only recordingToken is provided", () => {
    const resolved = resolveOptions({ recordingToken: "tok" });
    expect(resolved).toEqual({
      recordingToken: "tok",
      enabled: "development",
      inject: "auto",
      placeholderAttribute: "data-meticulous",
      snippetUrl: "https://snippet.meticulous.ai/v1/meticulous.js",
      attributes: {},
    });
  });

  it("preserves user-supplied values without mutating them", () => {
    const predicate = (): boolean => true;
    const attributes = { nonce: "abc" };
    const resolved = resolveOptions({
      recordingToken: "tok",
      enabled: predicate,
      inject: "replace",
      placeholderAttribute: "data-foo",
      snippetUrl: "https://example.test/snippet.js",
      attributes,
    });
    expect(resolved.enabled).toBe(predicate);
    expect(resolved.inject).toBe("replace");
    expect(resolved.placeholderAttribute).toBe("data-foo");
    expect(resolved.snippetUrl).toBe("https://example.test/snippet.js");
    expect(resolved.attributes).toBe(attributes);
  });
});
