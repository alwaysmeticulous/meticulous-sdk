import { afterEach, describe, expect, it } from "vitest";
import { getRecordingSnippetUrl } from "../get-recording-snippet-url";

describe("getRecordingSnippetUrl", () => {
  const originalSnippetsBaseUrl = process.env["METICULOUS_SNIPPETS_BASE_URL"];

  afterEach(() => {
    if (originalSnippetsBaseUrl === undefined) {
      delete process.env["METICULOUS_SNIPPETS_BASE_URL"];
    } else {
      process.env["METICULOUS_SNIPPETS_BASE_URL"] = originalSnippetsBaseUrl;
    }
  });

  it("returns the default CDN recording snippet URL", () => {
    delete process.env["METICULOUS_SNIPPETS_BASE_URL"];
    expect(getRecordingSnippetUrl()).toBe(
      "https://snippet.meticulous.ai/v1/meticulous.js",
    );
  });

  it("respects METICULOUS_SNIPPETS_BASE_URL", () => {
    process.env["METICULOUS_SNIPPETS_BASE_URL"] = "http://localhost:8888/";
    expect(getRecordingSnippetUrl()).toBe(
      "http://localhost:8888/v1/meticulous.js",
    );
  });
});
