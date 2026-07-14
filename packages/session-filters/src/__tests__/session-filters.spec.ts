import { describe, expect, it } from "vitest";
import {
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
});
