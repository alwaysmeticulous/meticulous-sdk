import { describe, expect, test, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { parseRewrites } from "../parse-rewrites";

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({ warn: vi.fn() }),
}));

describe("parseRewrites", () => {
  test("parses valid rewrites", () => {
    const result = parseRewrites(
      '[{"source": "**", "destination": "/index.html"}]',
    );
    expect(result).toEqual([{ source: "**", destination: "/index.html" }]);
  });

  test("returns empty array for default input", () => {
    expect(parseRewrites("[]")).toEqual([]);
    expect(parseRewrites(undefined)).toEqual([]);
  });

  test("throws on invalid JSON", () => {
    expect(() => parseRewrites("not json")).toThrow(CliUserError);
  });

  test("throws on non-array JSON", () => {
    expect(() => parseRewrites('{"source": "x"}')).toThrow(CliUserError);
  });

  test("throws when elements lack required properties", () => {
    expect(() => parseRewrites('[{"source": "x"}]')).toThrow(CliUserError);
  });
});
