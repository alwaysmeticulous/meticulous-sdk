import { describe, expect, it } from "vitest";
import { redactUrl } from "../redact-url";

describe("redactUrl", () => {
  it("redacts a simple url", () => {
    expect(redactUrl("https://example.com")).toMatchInlineSnapshot(
      `"https://redacted.com/"`
    );
  });

  it("redacts a complex URL", () => {
    expect(
      redactUrl(
        "https://user:password@example.com/path1/path2/index.html?param=value&param2=value2#hash"
      )
    ).toMatchInlineSnapshot(
      `"https://****:********@redacted.com/redacted/redacted/redacted?param=value&param2=value2&redactedParam1=redacted&redactedParam2=redacted#redactedHash"`
    );
  });
});
