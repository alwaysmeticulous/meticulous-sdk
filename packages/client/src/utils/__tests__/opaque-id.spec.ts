import { describe, expect, it } from "vitest";
import { assertOpaqueId, isOpaqueId } from "../opaque-id";

describe("isOpaqueId", () => {
  it("accepts a typical deployment id", () => {
    expect(isOpaqueId("dep-abc123")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isOpaqueId("")).toBe(false);
  });

  it("rejects a value containing whitespace", () => {
    expect(isOpaqueId("Directory does not exist")).toBe(false);
  });

  it("rejects a value containing a slash", () => {
    expect(isOpaqueId("/Users/example/app/build")).toBe(false);
  });

  it("rejects a value containing a colon", () => {
    expect(isOpaqueId("foo:bar")).toBe(false);
  });
});

describe("assertOpaqueId", () => {
  it("does not throw for a well-formed id", () => {
    expect(() => assertOpaqueId("deploymentId", "dep-abc123")).not.toThrow();
  });

  it("throws a message naming the field and the offending value", () => {
    expect(() =>
      assertOpaqueId(
        "deploymentId",
        "Directory does not exist: /Users/example/app/build",
      ),
    ).toThrow(/deploymentId must be a single opaque token/);
  });
});
