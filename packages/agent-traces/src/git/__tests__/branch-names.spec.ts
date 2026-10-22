import { describe, expect, it } from "vitest";
import { isDefaultBranchName, normaliseBranchName } from "../branch-names";

describe("normaliseBranchName", () => {
  it.each([
    ["feat/x", "feat/x"],
    [" refs/heads/feat/x ", "feat/x"],
    ["refs/remotes/upstream/feat/x", "feat/x"],
    ["origin/feat/x", "feat/x"],
    ["+feat/x", "feat/x"],
    ["edoardo/Bootstrap-v29", "edoardo/Bootstrap-v29"],
  ])("normalises %s", (ref, expected) => {
    expect(normaliseBranchName(ref)).toBe(expected);
  });

  it.each([
    "",
    "main",
    "origin/master",
    "refs/heads/develop",
    "HEAD",
    "feat x",
    "feat..x",
    "-b",
    "feat/",
    "feat.lock",
    "a:b",
  ])("rejects %j", (ref) => {
    expect(normaliseBranchName(ref)).toBeNull();
  });
});

describe("isDefaultBranchName", () => {
  it("is case-insensitive", () => {
    expect(isDefaultBranchName("Main")).toBe(true);
    expect(isDefaultBranchName("feat/main")).toBe(false);
  });
});
