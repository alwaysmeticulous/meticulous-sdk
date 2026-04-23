import { describe, it, expect, vi } from "vitest";
import {
  S3UploadError,
  retryTransientS3Errors,
} from "../retry-transient-s3-errors";

describe("retryTransientS3Errors", () => {
  const noSleep = async () => {};

  it("returns the value when the operation succeeds on the first attempt", async () => {
    const operation = vi.fn(async () => "ok");

    const result = await retryTransientS3Errors(operation, { sleep: noSleep });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on S3 503 SlowDown and eventually succeeds", async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new S3UploadError(503, "<Code>SlowDown</Code>");
      }
      return "ok";
    };

    const result = await retryTransientS3Errors(operation, { sleep: noSleep });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("retries on S3 500 InternalError", async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 2) {
        throw new S3UploadError(500, "<Code>InternalError</Code>");
      }
      return "ok";
    };

    const result = await retryTransientS3Errors(operation, { sleep: noSleep });

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("retries on 429 Too Many Requests", async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 2) {
        throw new S3UploadError(429, "");
      }
      return "ok";
    };

    const result = await retryTransientS3Errors(operation, { sleep: noSleep });

    expect(attempts).toBe(2);
    expect(result).toBe("ok");
  });

  it("retries on transient network errors like ECONNRESET", async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 2) {
        const err = new Error("socket hang up") as Error & { code: string };
        err.code = "ECONNRESET";
        throw err;
      }
      return "ok";
    };

    const result = await retryTransientS3Errors(operation, { sleep: noSleep });

    expect(attempts).toBe(2);
    expect(result).toBe("ok");
  });

  it("does not retry on 4xx client errors (e.g. 403 Forbidden)", async () => {
    const operation = vi.fn(async () => {
      throw new S3UploadError(403, "<Code>AccessDenied</Code>");
    });

    await expect(
      retryTransientS3Errors(operation, { sleep: noSleep }),
    ).rejects.toBeInstanceOf(S3UploadError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry on arbitrary non-transient errors", async () => {
    const operation = vi.fn(async () => {
      throw new Error("something unrelated");
    });

    await expect(
      retryTransientS3Errors(operation, { sleep: noSleep }),
    ).rejects.toThrow("something unrelated");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("throws the last error after exhausting retries", async () => {
    const operation = vi.fn(async () => {
      throw new S3UploadError(503, "<Code>SlowDown</Code>");
    });

    await expect(
      retryTransientS3Errors(operation, {
        sleep: noSleep,
        maxAttempts: 3,
      }),
    ).rejects.toBeInstanceOf(S3UploadError);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("applies exponential backoff with jitter between retries", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 4) {
        throw new S3UploadError(503, "");
      }
      return "ok";
    };

    // Make jitter deterministic
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      await retryTransientS3Errors(operation, {
        sleep,
        baseDelayMs: 100,
      });
    } finally {
      randomSpy.mockRestore();
    }

    // With Math.random() = 0.5, jitter multiplier = 0.5 + 0.5 = 1.0
    // So delays should be: 100, 200, 400
    expect(delays).toEqual([100, 200, 400]);
  });

  it("invokes onRetry with attempt number and error before sleeping", async () => {
    const onRetry = vi.fn();
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new S3UploadError(503, "");
      }
      return "ok";
    };

    await retryTransientS3Errors(operation, {
      sleep: noSleep,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(S3UploadError));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(S3UploadError));
  });
});

describe("S3UploadError", () => {
  it("exposes the status code and response body", () => {
    const error = new S3UploadError(503, "<Code>SlowDown</Code>");
    expect(error.statusCode).toBe(503);
    expect(error.responseBody).toBe("<Code>SlowDown</Code>");
  });

  it("formats the message so existing logs remain readable", () => {
    const error = new S3UploadError(503, "<Code>SlowDown</Code>");
    expect(error.message).toContain("Failed to upload!");
    expect(error.message).toContain("Status 503");
    expect(error.message).toContain("<Code>SlowDown</Code>");
  });

  it("is an instance of Error", () => {
    const error = new S3UploadError(500, "");
    expect(error).toBeInstanceOf(Error);
  });
});
