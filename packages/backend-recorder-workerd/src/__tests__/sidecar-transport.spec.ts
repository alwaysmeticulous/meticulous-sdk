import { describe, expect, it, vi } from "vitest";
import {
  resolveSidecarTransport,
  SIDECAR_BINDING_ORIGIN,
  sidecarFetch,
  type SidecarFetcher,
  transportOrigin,
} from "../sidecar-transport";

const fakeBinding = (): SidecarFetcher & { calls: Request[] } => {
  const calls: Request[] = [];
  return {
    calls,
    fetch: (...args: unknown[]) => {
      calls.push(args[0] as Request);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  };
};

describe("resolveSidecarTransport", () => {
  it("returns undefined when neither a binding nor a URL is configured", () => {
    expect(resolveSidecarTransport(undefined, {})).toBeUndefined();
    expect(resolveSidecarTransport(undefined, undefined)).toBeUndefined();
    // An empty var is how a missing value shows up in wrangler config, so it must not count.
    expect(
      resolveSidecarTransport(undefined, { METICULOUS_SIDECAR_URL: "" }),
    ).toBeUndefined();
  });

  it("reads a service binding off env", () => {
    const binding = fakeBinding();
    const transport = resolveSidecarTransport(undefined, {
      METICULOUS_SIDECAR: binding,
    });

    expect(transport).toEqual({
      kind: "binding",
      fetcher: binding,
      instance: binding,
    });
  });

  it("strips trailing slashes off a URL so the self-capture guard matches", () => {
    const transport = resolveSidecarTransport(undefined, {
      METICULOUS_SIDECAR_URL: "http://127.0.0.1:9670//",
    });

    expect(transport).toEqual({ kind: "url", url: "http://127.0.0.1:9670" });
  });

  it("prefers a binding over a URL", () => {
    const binding = fakeBinding();

    const transport = resolveSidecarTransport(undefined, {
      METICULOUS_SIDECAR: binding,
      METICULOUS_SIDECAR_URL: "http://127.0.0.1:9670",
    });

    // Both are only ever set together by accident — a `.dev.vars` left in an image travels with
    // it, whereas the binding had to be added to this deployment's wrangler config on purpose.
    expect(transport).toMatchObject({ kind: "binding" });
  });

  it("prefers explicit options over env", () => {
    const binding = fakeBinding();
    const otherBinding = fakeBinding();

    expect(
      resolveSidecarTransport(
        { sidecarBinding: binding },
        { METICULOUS_SIDECAR: otherBinding },
      ),
    ).toMatchObject({ fetcher: binding });
    expect(
      resolveSidecarTransport(
        { sidecarUrl: "http://127.0.0.1:1234" },
        { METICULOUS_SIDECAR_URL: "http://127.0.0.1:9670" },
      ),
    ).toEqual({ kind: "url", url: "http://127.0.0.1:1234" });
  });

  it("ignores a non-Fetcher value under the binding key", () => {
    // A plain var accidentally named METICULOUS_SIDECAR must not be mistaken for a binding.
    expect(
      resolveSidecarTransport(undefined, { METICULOUS_SIDECAR: "yes" }),
    ).toBeUndefined();
  });
});

describe("sidecarFetch", () => {
  it("addresses a binding request at the origin the self-capture guards check", async () => {
    const binding = fakeBinding();

    await sidecarFetch(
      { kind: "binding", fetcher: binding, instance: binding },
      vi.fn() as unknown as typeof globalThis.fetch,
      "/v1/events",
      { method: "POST", body: "{}" },
    );

    expect(binding.calls).toHaveLength(1);
    expect(binding.calls[0].url).toBe(`${SIDECAR_BINDING_ORIGIN}/v1/events`);
    // The guards compare against this exact origin, so the two must agree.
    expect(
      transportOrigin({ kind: "binding", fetcher: binding, instance: binding }),
    ).toBe(SIDECAR_BINDING_ORIGIN);
  });

  it("uses the passed fetch, not the binding, for a URL transport", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await sidecarFetch(
      { kind: "url", url: "http://127.0.0.1:9670" },
      fetchFn as unknown as typeof globalThis.fetch,
      "/v1/events",
      { method: "POST" },
    );

    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:9670/v1/events",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
