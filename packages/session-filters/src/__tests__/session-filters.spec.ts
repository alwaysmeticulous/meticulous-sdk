import { describe, expect, it } from "vitest";
import {
  compileSessionFilter,
  MAX_SESSION_FILTER_REGEXES,
  validateSessionFilter,
} from "../session-filters";

describe("validateSessionFilter", () => {
  it("accepts a valid filter", () => {
    const result = validateSessionFilter({
      type: "session-start-url-matches-any-regex",
      regexes: ["my-path/", "your-path/two/"],
    });
    expect(result).toEqual({
      valid: true,
      filter: {
        type: "session-start-url-matches-any-regex",
        regexes: ["my-path/", "your-path/two/"],
      },
    });
  });

  it("rejects non-object values", () => {
    for (const value of [null, undefined, "filter", 42, ["a"]]) {
      const result = validateSessionFilter(value);
      expect(result.valid).toBe(false);
    }
  });

  it("rejects unknown filter types", () => {
    const result = validateSessionFilter({
      type: "session-navigates-to",
      regexes: ["a"],
    });
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain("Unknown session filter type");
  });

  it("rejects a missing or non-array regexes field", () => {
    for (const regexes of [undefined, "a", { a: 1 }]) {
      const result = validateSessionFilter({
        type: "session-start-url-matches-any-regex",
        regexes,
      });
      expect(result.valid).toBe(false);
    }
  });

  it("rejects an empty regexes list", () => {
    const result = validateSessionFilter({
      type: "session-start-url-matches-any-regex",
      regexes: [],
    });
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain("must not be empty");
  });

  it("rejects non-string and empty-string regexes", () => {
    for (const regexes of [[42], [""], ["ok", null]]) {
      const result = validateSessionFilter({
        type: "session-start-url-matches-any-regex",
        regexes,
      });
      expect(result.valid).toBe(false);
    }
  });

  it("rejects more regexes than the maximum", () => {
    const result = validateSessionFilter({
      type: "session-start-url-matches-any-regex",
      regexes: Array.from(
        { length: MAX_SESSION_FILTER_REGEXES + 1 },
        () => "a",
      ),
    });
    expect(result.valid).toBe(false);
  });

  it("rejects regexes that do not compile", () => {
    const result = validateSessionFilter({
      type: "session-start-url-matches-any-regex",
      regexes: ["valid", "(unclosed"],
    });
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain('"(unclosed"');
    expect(result.error).toContain("does not compile");
  });

  it("rejects regexes with features unsupported by the linear-time engine", () => {
    // Backreferences and lookaheads are backtracking features that RE2
    // (deliberately) does not support.
    const result = validateSessionFilter({
      type: "session-start-url-matches-any-regex",
      regexes: ["(?=lookahead)"],
    });
    expect(result.valid).toBe(false);
  });
});

describe("compileSessionFilter", () => {
  const matcher = compileSessionFilter({
    type: "session-start-url-matches-any-regex",
    regexes: ["/checkout/", "^https://app\\.example\\.com/settings"],
  });

  it("matches a start URL matching any of the regexes", () => {
    expect(matcher("https://shop.example.com/checkout/payment")).toBe(true);
    expect(matcher("https://app.example.com/settings/profile")).toBe(true);
  });

  it("does not match a start URL matching none of the regexes", () => {
    expect(matcher("https://app.example.com/dashboard")).toBe(false);
  });

  it("matches anywhere in the URL (unanchored) like the underlying engine", () => {
    expect(matcher("https://example.com/a/checkout/b")).toBe(true);
  });
});
