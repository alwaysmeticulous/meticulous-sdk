import { describe, expect, it } from "vitest";
import { internStrings, MAX_POOLED_STRINGS } from "../intern-strings";

/** Reports a full pool without allocating a million entries, which can exceed the test timeout on CI. */
class FullPool extends Map<string, string> {
  override get size(): number {
    return MAX_POOLED_STRINGS;
  }
}

describe("internStrings", () => {
  it("pools every string in nested objects and arrays without changing values", () => {
    const pool = new Map<string, string>();
    const value = {
      url: "https://app.example.com",
      violations: [
        { ruleId: "image-alt", nodes: [{ target: "img", html: "<img>" }] },
        { ruleId: "image-alt", nodes: [{ target: "img", html: "<img>" }] },
      ],
      count: 2,
      missing: null,
      flag: true,
    };
    const expected = structuredClone(value);

    expect(internStrings(value, pool)).toBe(value);
    expect(value).toEqual(expected);
    expect([...pool.keys()].sort()).toEqual(
      ["<img>", "https://app.example.com", "image-alt", "img"].sort(),
    );
  });

  it("returns the pooled copy for a top-level string and passes other primitives through", () => {
    const pool = new Map<string, string>();

    expect(internStrings("final-state", pool)).toBe("final-state");
    expect(internStrings(null, pool)).toBeNull();
    expect(internStrings(7, pool)).toBe(7);
    expect([...pool.keys()]).toEqual(["final-state"]);
  });

  it("stops growing the pool at MAX_POOLED_STRINGS but still returns every value", () => {
    const pool = new FullPool([["7", "7"]]);
    const value = { known: "7", unseen: "not-yet-pooled" };

    expect(internStrings(value, pool)).toEqual({
      known: "7",
      unseen: "not-yet-pooled",
    });
    expect([...pool.keys()]).toEqual(["7"]);
  });

  it("leaves frozen containers untouched but still walks their children", () => {
    const pool = new Map<string, string>();
    const nested = { html: "<img>" };
    const value = Object.freeze({
      shared: "frozen-field",
      nested,
      list: Object.freeze(["frozen-item"]),
    });

    expect(internStrings(value, pool)).toBe(value);
    expect([...pool.keys()].sort()).toEqual(
      ["<img>", "frozen-field", "frozen-item"].sort(),
    );
  });

  it("handles nesting far deeper than the call stack allows", () => {
    const pool = new Map<string, string>();
    let deep: unknown = "leaf";
    for (let depth = 0; depth < 100_000; depth++) {
      deep = [deep];
    }

    expect(() => internStrings(deep, pool)).not.toThrow();
    expect([...pool.keys()]).toEqual(["leaf"]);
  });
});
