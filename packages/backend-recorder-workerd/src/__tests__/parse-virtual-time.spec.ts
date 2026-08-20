import { describe, expect, it } from "vitest";
import { parseVirtualTimeMs } from "../protocol";

describe("parseVirtualTimeMs", () => {
  it("parses a non-negative number, including zero", () => {
    expect(parseVirtualTimeMs("0")).toBe(0);
    expect(parseVirtualTimeMs("1500")).toBe(1500);
  });

  it("ignores missing, empty, negative, and non-numeric values", () => {
    expect(parseVirtualTimeMs(undefined)).toBeUndefined();
    expect(parseVirtualTimeMs(null)).toBeUndefined();
    expect(parseVirtualTimeMs("")).toBeUndefined();
    expect(parseVirtualTimeMs("-1")).toBeUndefined();
    expect(parseVirtualTimeMs("nope")).toBeUndefined();
  });
});
