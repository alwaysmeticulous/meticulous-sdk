import { describe, expect, it } from "vitest";
import { getErrorCode } from "../src/error-code.utils";
import {
  computeRetryDelayMs,
  defaultShouldRetry,
  getRetryAfterMs,
} from "../src/http-retry.utils";

describe("getErrorCode", () => {
  it("returns the deepest nested error code", () => {
    const error = {
      cause: {
        code: "UND_ERR_SOCKET",
        cause: {
          code: "ECONNRESET",
        },
      },
    };

    expect(getErrorCode(error)).toBe("ECONNRESET");
  });

  it("handles cyclic error causes without throwing", () => {
    const error: { code: string; cause?: unknown } = {
      code: "ECONNRESET",
    };
    error.cause = error;

    expect(getErrorCode(error)).toBe("ECONNRESET");
  });
});

describe("defaultShouldRetry", () => {
  it("retries undici socket errors when the root cause is retryable", () => {
    const error = new TypeError("fetch failed");
    (error as TypeError & { cause?: unknown }).cause = {
      code: "UND_ERR_SOCKET",
      cause: {
        code: "ETIMEDOUT",
      },
    };

    expect(defaultShouldRetry(error)).toBe(true);
  });

  it("does not retry abort errors", () => {
    expect(defaultShouldRetry({ name: "AbortError" })).toBe(false);
  });

  it("retries 429 and 503 backpressure responses", () => {
    expect(defaultShouldRetry({ response: { status: 429 } })).toBe(true);
    expect(defaultShouldRetry({ response: { status: 503 } })).toBe(true);
  });

  it("does not retry other 4xx responses", () => {
    expect(defaultShouldRetry({ response: { status: 400 } })).toBe(false);
    expect(defaultShouldRetry({ response: { status: 404 } })).toBe(false);
  });
});

describe("getRetryAfterMs", () => {
  it("parses a delay in seconds", () => {
    expect(
      getRetryAfterMs({ response: { headers: { "retry-after": "5" } } }),
    ).toBe(5_000);
  });

  it("parses an HTTP date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const value = new Date(now + 4_000).toUTCString();
    expect(
      getRetryAfterMs(
        { response: { headers: { "retry-after": value } } },
        now,
      ),
    ).toBe(4_000);
  });

  it("returns null when no header is present", () => {
    expect(getRetryAfterMs({ response: { headers: {} } })).toBeNull();
    expect(getRetryAfterMs({})).toBeNull();
  });
});

describe("computeRetryDelayMs", () => {
  it("honours Retry-After plus jitter, capped at maxRetryDelay", () => {
    const delay = computeRetryDelayMs(
      0,
      { retryDelay: 1_000, maxRetryDelay: 30_000, retryAfterMs: 5_000 },
      () => 0.5,
    );
    // 5000 + 0.5 * 1000 jitter window
    expect(delay).toBe(5_500);
  });

  it("caps a long Retry-After at maxRetryDelay", () => {
    const delay = computeRetryDelayMs(
      0,
      { retryDelay: 1_000, maxRetryDelay: 10_000, retryAfterMs: 60_000 },
      () => 1,
    );
    expect(delay).toBe(10_000);
  });

  it("grows exponentially with equal jitter when no Retry-After", () => {
    // attempt 0: capped backoff = 1000, equal jitter with random=0 -> 500
    expect(
      computeRetryDelayMs(
        0,
        { retryDelay: 1_000, maxRetryDelay: 30_000, retryAfterMs: null },
        () => 0,
      ),
    ).toBe(500);
    // attempt 2: capped backoff = 4000, equal jitter with random=1 -> 4000
    expect(
      computeRetryDelayMs(
        2,
        { retryDelay: 1_000, maxRetryDelay: 30_000, retryAfterMs: null },
        () => 1,
      ),
    ).toBe(4_000);
  });

  it("never exceeds maxRetryDelay on the exponential path", () => {
    const delay = computeRetryDelayMs(
      20,
      { retryDelay: 1_000, maxRetryDelay: 30_000, retryAfterMs: null },
      () => 1,
    );
    expect(delay).toBe(30_000);
  });
});
