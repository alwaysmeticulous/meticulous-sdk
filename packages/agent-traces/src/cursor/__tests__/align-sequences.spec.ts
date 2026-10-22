import { describe, expect, it } from "vitest";
import { alignSequences } from "../merge/align-sequences";

const sameLetter = (a: string, b: string) => (a === b ? 1 : 0);

describe("alignSequences", () => {
  it("pairs the longest common subsequence in order", () => {
    expect(
      alignSequences(["a", "b", "c", "d"], ["b", "x", "d"], sameLetter),
    ).toEqual([
      [1, 0],
      [3, 2],
    ]);
  });

  it("prefers pairing the latest items when several alignments tie", () => {
    expect(alignSequences(["a", "a", "a"], ["a"], sameLetter)).toEqual([
      [2, 0],
    ]);
  });

  it("prefers heavier pairs over more pairs", () => {
    const weight = (a: string, b: string) => (a === b ? 5 : 1);
    expect(alignSequences(["x", "y"], ["y"], weight)).toEqual([[1, 0]]);
    expect(alignSequences(["x", "y"], ["z", "w"], weight)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("returns nothing when either side is empty", () => {
    expect(alignSequences([], ["a"], sameLetter)).toEqual([]);
    expect(alignSequences(["a"], [], sameLetter)).toEqual([]);
  });

  it("falls back to a greedy pass for very long sequences", () => {
    const long = Array.from({ length: 3000 }, (_, index) => `item-${index}`);
    const pairs = alignSequences(long, long, sameLetter);
    expect(pairs).toHaveLength(3000);
    expect(pairs[2999]).toEqual([2999, 2999]);
  });
});
