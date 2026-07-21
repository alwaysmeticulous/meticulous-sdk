import { describe, expect, test, vi } from "vitest";
import { warnIfRewriteSourcesLookLikeRegexes } from "../warn-regex-rewrites";

vi.mock("@alwaysmeticulous/common", () => {
  const warn = vi.fn();
  return {
    initLogger: () => ({ warn }),
    __mockWarn: warn,
  };
});

const getMockWarn = async () => {
  const mod = await import("@alwaysmeticulous/common");
  return (mod as unknown as { __mockWarn: ReturnType<typeof vi.fn> })
    .__mockWarn;
};

describe("warnIfRewriteSourcesLookLikeRegexes", () => {
  test("warns on capture group with quantifier, e.g. (.*)", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/a/b/(.*)", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("look like regular expressions"),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/a/b/(.*)"));
  });

  test("warns on (.+) pattern", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/path/(.+)", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/path/(.+)"));
  });

  test("warns on non-capturing group (?:...)", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/(?:foo|bar)/page", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("(?:foo|bar)"));
  });

  test("warns on backslash escape", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/user/\\d+", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("backslash escape"),
    );
  });

  test("warns on .* after a slash", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/api/.*", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("regex wildcard .*"),
    );
  });

  test("warns on .* at the start of the string", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: ".*", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("regex wildcard .*"),
    );
  });

  test("warns on .+ pattern", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/api/.+", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("regex quantifier .+"),
    );
  });

  test("warns on $ end anchor", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "/path$", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("end-of-string anchor"),
    );
  });

  test("warns on ^ start anchor", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "^/path", destination: "/index.html" },
    ]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("start-of-string anchor"),
    );
  });

  test("does not warn on valid glob patterns", async () => {
    const warn = await getMockWarn();
    warn.mockClear();

    warnIfRewriteSourcesLookLikeRegexes([
      { source: "**", destination: "/index.html" },
      { source: "/app/**", destination: "/app/index.html" },
      { source: "/files/*.html", destination: "/index.html" },
      { source: "file.*", destination: "/index.html" },
      { source: "*.*", destination: "/index.html" },
    ]);

    expect(warn).not.toHaveBeenCalled();
  });
});
