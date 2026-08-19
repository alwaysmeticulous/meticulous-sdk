import { describe, expect, it } from "vitest";
import { WORKERD_SHIM_VERSION_HEADER } from "../protocol";
import { publishWorkerdShimVersionOnResponse } from "../publish-shim-version";
import { WORKERD_SHIM_VERSION } from "../version";

describe("publishWorkerdShimVersionOnResponse", () => {
  it("stamps the shim version on a mutable response", () => {
    const response = new Response("ok");

    const published = publishWorkerdShimVersionOnResponse(response);

    expect(published.headers.get(WORKERD_SHIM_VERSION_HEADER)).toBe(
      WORKERD_SHIM_VERSION,
    );
    expect(published).toBe(response);
  });

  it("rebuilds a response whose headers are immutable", async () => {
    const original = new Response("body", {
      headers: { "content-type": "text/plain" },
    });
    Object.defineProperty(original.headers, "set", {
      value: () => {
        throw new TypeError("immutable");
      },
    });

    const published = publishWorkerdShimVersionOnResponse(original);

    expect(published).not.toBe(original);
    expect(published.headers.get(WORKERD_SHIM_VERSION_HEADER)).toBe(
      WORKERD_SHIM_VERSION,
    );
    expect(await published.text()).toBe("body");
  });
});
