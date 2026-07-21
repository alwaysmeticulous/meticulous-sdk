import { describe, expect, it } from "vitest";
import { validateAssetReferencesManifest } from "./run-with-uploaded-asset-chunks.utils";

describe("validateAssetReferencesManifest", () => {
  it("accepts versionLookup entries mixed with concrete entries", () => {
    const result = validateAssetReferencesManifest([
      { name: "app", versionId: "v1" },
      { name: "vendor", versionLookup: "latest-in-history" },
    ]);
    expect(result).toEqual({
      manifest: [
        { name: "app", versionId: "v1" },
        { name: "vendor", versionLookup: "latest-in-history" },
      ],
    });
  });

  it("rejects unknown versionLookup values", () => {
    const result = validateAssetReferencesManifest([
      { name: "vendor", versionLookup: "unknown-strategy" },
    ]);
    expect(result).toHaveProperty("errorMessage");
  });

  it("rejects duplicate chunk names", () => {
    const result = validateAssetReferencesManifest([
      { name: "app", versionId: "v1" },
      { name: "app", versionId: "v2" },
    ]);
    expect(result).toMatchObject({
      errorMessage: expect.stringContaining("duplicate chunk names"),
    });
  });
});
