import { join } from "path";
import { describe, expect, it } from "vitest";
import { readHeadLines } from "../collect/read-head-lines";
import { writeTree } from "./trace-fixtures";

describe("readHeadLines", () => {
  const root = writeTree({
    "a.jsonl": "one\ntwo\nthree",
    "b.jsonl": "x".repeat(100),
  });

  it("reads up to the line limit, keeping a final line without a newline", async () => {
    expect(await readHeadLines(join(root, "a.jsonl"), 2, 1000)).toEqual([
      "one",
      "two",
    ]);
    expect(await readHeadLines(join(root, "a.jsonl"), 10, 1000)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("drops a line cut off by the byte limit", async () => {
    expect(await readHeadLines(join(root, "a.jsonl"), 10, 6)).toEqual(["one"]);
    expect(await readHeadLines(join(root, "b.jsonl"), 10, 50)).toEqual([]);
  });
});
