import { describe, expect, it } from "vitest";
import { parseMeticulousSha } from "../meticulous-sha";

describe("parseMeticulousSha", () => {
  it("returns a clean SHA unchanged", () => {
    expect(
      parseMeticulousSha("df7aad61870c8d6a1a64daa62f444256c78b7740"),
    ).toEqual({
      sha: "df7aad61870c8d6a1a64daa62f444256c78b7740",
      wasUnclean: false,
    });
  });

  it("strips the -unclean suffix and flags the build as unclean", () => {
    expect(
      parseMeticulousSha("df7aad61870c8d6a1a64daa62f444256c78b7740-unclean"),
    ).toEqual({
      sha: "df7aad61870c8d6a1a64daa62f444256c78b7740",
      wasUnclean: true,
    });
  });

  it("handles undefined", () => {
    expect(parseMeticulousSha(undefined)).toEqual({
      sha: undefined,
      wasUnclean: false,
    });
  });

  it("handles an empty string", () => {
    expect(parseMeticulousSha("")).toEqual({
      sha: undefined,
      wasUnclean: false,
    });
  });

  it("only treats the exact -unclean suffix as unclean, not the substring", () => {
    expect(parseMeticulousSha("uncleanbuild123")).toEqual({
      sha: "uncleanbuild123",
      wasUnclean: false,
    });
  });

  it("is idempotent on an already-stripped SHA", () => {
    const once = parseMeticulousSha("abc123-unclean");
    expect(parseMeticulousSha(once.sha)).toEqual({
      sha: "abc123",
      wasUnclean: false,
    });
  });
});
