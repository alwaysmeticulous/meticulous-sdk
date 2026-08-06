import { describe, expect, it, vi } from "vitest";
import type { CaptureEvent } from "../protocol";
import { postCaptureEvents } from "../sidecar-client";

const EVENT: CaptureEvent = {
  kind: "inbound",
  requestId: "req-1",
  method: "GET",
  url: "https://example.test/",
  requestHeaders: {},
  startTimeMs: 1,
  endTimeMs: 2,
};

const SIDECAR_URL = "http://127.0.0.1:9670";

describe("postCaptureEvents", () => {
  it("bounds the POST with an abort signal", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await postCaptureEvents(fetchFn, SIDECAR_URL, [EVENT]);

    const init = fetchFn.mock.calls[0][1] as RequestInit;
    // A sidecar that drops packets rather than refusing them would otherwise keep the
    // request context open on every captured call.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("clears the timeout once the POST settles", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));

      await postCaptureEvents(fetchFn, SIDECAR_URL, [EVENT]);
      vi.advanceTimersByTime(60_000);

      // A timer left pending after the POST finished would keep workerd's request context
      // alive for the rest of the timeout, on the healthy path — the regression this guards.
      const init = fetchFn.mock.calls[0][1] as RequestInit;
      expect(init.signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves without throwing when the POST is aborted", async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Capture runs under ctx.waitUntil: a rejection here would surface as an unhandled
    // rejection in the app, so the timeout must never escape.
    await expect(
      postCaptureEvents(fetchFn, SIDECAR_URL, [EVENT]),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "Could not reach the Meticulous backend recorder sidecar",
      ),
      expect.anything(),
    );
    warn.mockRestore();
  });
});
