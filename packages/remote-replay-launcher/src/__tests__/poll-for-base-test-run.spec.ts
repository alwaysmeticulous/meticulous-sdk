import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { pollWhileBaseNotFound } from "../poll-for-base-test-run";

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const TEST_RUN = { id: "test-run-123" } as any;

describe("pollWhileBaseNotFound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back after the default 5 minute window", async () => {
    const retryFn = vi
      .fn()
      .mockResolvedValue({ testRun: null, baseNotFound: true });
    const fallbackFn = vi
      .fn()
      .mockResolvedValue({ testRun: TEST_RUN, baseNotFound: false });

    const resultPromise = pollWhileBaseNotFound({
      initialResult: { testRun: null, baseNotFound: true },
      retryFn,
      fallbackFn,
    });
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    const result = await resultPromise;

    expect(result.testRun).toEqual(TEST_RUN);
    expect(fallbackFn).toHaveBeenCalledTimes(1);
    // 5 minute window with a 10s poll interval: ~30 retries.
    expect(retryFn.mock.calls.length).toBeLessThanOrEqual(31);
  });

  it("keeps polling for the server-provided extraBasePollTimeoutMs", async () => {
    const retryFn = vi.fn().mockResolvedValue({
      testRun: null,
      baseNotFound: true,
      extraBasePollTimeoutMs: 5 * 60 * 1000,
    });
    const fallbackFn = vi
      .fn()
      .mockResolvedValue({ testRun: null, baseNotFound: false });

    const resultPromise = pollWhileBaseNotFound({
      initialResult: {
        testRun: null,
        baseNotFound: true,
        extraBasePollTimeoutMs: 5 * 60 * 1000,
      },
      retryFn,
      fallbackFn,
    });

    // Just past the default window: must still be polling, not fallen back.
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    expect(fallbackFn).not.toHaveBeenCalled();

    // Base appears within the extended window.
    retryFn.mockResolvedValue({ testRun: TEST_RUN, baseNotFound: false });
    await vi.advanceTimersByTimeAsync(60 * 1000);
    const result = await resultPromise;

    expect(result.testRun).toEqual(TEST_RUN);
    expect(fallbackFn).not.toHaveBeenCalled();
  });

  it("falls back once the extended window also elapses", async () => {
    const retryFn = vi.fn().mockResolvedValue({
      testRun: null,
      baseNotFound: true,
      extraBasePollTimeoutMs: 5 * 60 * 1000,
    });
    const fallbackFn = vi
      .fn()
      .mockResolvedValue({ testRun: TEST_RUN, baseNotFound: false });

    const resultPromise = pollWhileBaseNotFound({
      initialResult: {
        testRun: null,
        baseNotFound: true,
        extraBasePollTimeoutMs: 5 * 60 * 1000,
      },
      retryFn,
      fallbackFn,
    });
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    const result = await resultPromise;

    expect(result.testRun).toEqual(TEST_RUN);
    expect(fallbackFn).toHaveBeenCalledTimes(1);
  });
});
