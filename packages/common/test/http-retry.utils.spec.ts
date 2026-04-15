import { describe, expect, it } from "vitest";
import { getErrorCode } from "../src/error-code.utils";
import { defaultShouldRetry } from "../src/http-retry.utils";

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
});
