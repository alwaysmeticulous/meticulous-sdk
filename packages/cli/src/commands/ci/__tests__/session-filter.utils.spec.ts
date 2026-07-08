import { describe, expect, it } from "vitest";
import { parseSessionFilterFileContents } from "../session-filter.utils";

describe("parseSessionFilterFileContents", () => {
  it("parses a valid session filter file", () => {
    const result = parseSessionFilterFileContents(
      JSON.stringify({
        "session-start-url-matches-any-regex": ["my-path/", "your-path/two/"],
      }),
    );
    expect(result).toEqual({
      valid: true,
      filter: {
        type: "session-start-url-matches-any-regex",
        regexes: ["my-path/", "your-path/two/"],
      },
    });
  });

  it("rejects invalid JSON", () => {
    const result = parseSessionFilterFileContents("{not json");
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain("not valid JSON");
  });

  it("rejects non-object JSON", () => {
    for (const contents of ["[]", '"filter"', "42", "null"]) {
      expect(parseSessionFilterFileContents(contents).valid).toBe(false);
    }
  });

  it("rejects unsupported keys", () => {
    const result = parseSessionFilterFileContents(
      JSON.stringify({
        "session-start-url-matches-any-regex": ["a"],
        "session-navigates-to": ["b"],
      }),
    );
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain("session-navigates-to");
  });

  it("rejects a file without the expected key", () => {
    const result = parseSessionFilterFileContents("{}");
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain("session-start-url-matches-any-regex");
  });

  it("rejects an empty regex list", () => {
    const result = parseSessionFilterFileContents(
      JSON.stringify({ "session-start-url-matches-any-regex": [] }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects regexes that do not compile", () => {
    const result = parseSessionFilterFileContents(
      JSON.stringify({ "session-start-url-matches-any-regex": ["(unclosed"] }),
    );
    expect(result).toMatchObject({ valid: false });
    if (result.valid) {
      throw new Error("expected invalid");
    }
    expect(result.error).toContain("does not compile");
  });
});
