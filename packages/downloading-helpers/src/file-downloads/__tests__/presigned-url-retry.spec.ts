import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { createPresignedUrlRetryConfig } from "../presigned-url-retry";

describe("createPresignedUrlRetryConfig", () => {
  it("retries five times", () => {
    expect(createPresignedUrlRetryConfig().retries).toBe(5);
  });

  it.each([1, 2, 3, 4, 5])(
    "waits between 2^n * 500ms and 1.2x that before retry %i",
    (retryNumber) => {
      const { retryDelay } = createPresignedUrlRetryConfig();
      const error = new AxiosError("SlowDown", "ERR_BAD_RESPONSE");
      const minDelay = 2 ** retryNumber * 500;

      for (let sample = 0; sample < 50; sample++) {
        const delay = retryDelay?.(retryNumber, error);
        expect(delay).toBeGreaterThanOrEqual(minDelay);
        expect(delay).toBeLessThanOrEqual(minDelay * 1.2);
      }
    },
  );

  it("caps the delay at 30s when the response asks for a longer Retry-After", () => {
    const { retryDelay } = createPresignedUrlRetryConfig();
    const config = { headers: new AxiosHeaders() };
    const error = new AxiosError(
      "SlowDown",
      "ERR_BAD_RESPONSE",
      config,
      undefined,
      {
        data: undefined,
        status: 503,
        statusText: "Slow Down",
        headers: { "retry-after": "3600" },
        config,
      },
    );

    // Exactly the cap: without it this would be about an hour, and without
    // reading the header about 1s.
    expect(retryDelay?.(1, error)).toBe(30_000);
  });

  it("applies overrides on top of the defaults", () => {
    const config = createPresignedUrlRetryConfig({
      retries: 2,
      shouldResetTimeout: true,
    });

    expect(config.retries).toBe(2);
    expect(config.shouldResetTimeout).toBe(true);
    expect(config.retryDelay).toBeTypeOf("function");
  });

  it("returns a fresh object on each call", () => {
    const first = createPresignedUrlRetryConfig();
    first.retries = 0;

    const second = createPresignedUrlRetryConfig();

    expect(second).not.toBe(first);
    expect(second.retries).toBe(5);
  });
});
