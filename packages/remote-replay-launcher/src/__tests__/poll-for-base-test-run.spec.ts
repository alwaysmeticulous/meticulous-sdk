import type * as Common from "@alwaysmeticulous/common";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { pollWhileBaseNotFound } from "../poll-for-base-test-run";

// Only the logging is stubbed; the retry helper is kept real so the fallback's
// retry behaviour is genuinely exercised.
vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  initLogger: () => ({
    debug: vi.fn(),
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

  describe("when the backend says the deployment is still being processed", () => {
    const inProgressError = Object.assign(new Error("in progress"), {
      response: { status: 503 },
    });

    it("keeps polling rather than failing the run", async () => {
      // The response was lost at the gateway while the trigger carried on
      // server-side. Giving up here would abandon a run that is still being
      // created for us.
      const retryFn = vi
        .fn()
        .mockRejectedValueOnce(inProgressError)
        .mockRejectedValueOnce(inProgressError)
        .mockResolvedValue({ testRun: TEST_RUN, baseNotFound: false });
      const fallbackFn = vi.fn();

      const resultPromise = pollWhileBaseNotFound({
        initialResult: { testRun: null, baseNotFound: true },
        retryFn,
        fallbackFn,
      });
      await vi.advanceTimersByTimeAsync(60 * 1000);
      const result = await resultPromise;

      expect(result.testRun).toEqual(TEST_RUN);
      expect(retryFn).toHaveBeenCalledTimes(3);
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it("still gives up at the deadline rather than polling forever", async () => {
      const retryFn = vi.fn().mockRejectedValue(inProgressError);
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
    });

    it("retries the fallback too, rather than failing at the last call", async () => {
      const retryFn = vi
        .fn()
        .mockResolvedValue({ testRun: null, baseNotFound: true });
      const fallbackFn = vi
        .fn()
        .mockRejectedValueOnce(inProgressError)
        .mockResolvedValue({ testRun: TEST_RUN, baseNotFound: false });

      const resultPromise = pollWhileBaseNotFound({
        initialResult: { testRun: null, baseNotFound: true },
        retryFn,
        fallbackFn,
      });
      await vi.advanceTimersByTimeAsync(7 * 60 * 1000);
      const result = await resultPromise;

      expect(result.testRun).toEqual(TEST_RUN);
      expect(fallbackFn).toHaveBeenCalledTimes(2);
    });

    it("propagates a fallback failure that isn't the deployment being in progress", async () => {
      const retryFn = vi
        .fn()
        .mockResolvedValue({ testRun: null, baseNotFound: true });
      const fallbackFn = vi.fn().mockRejectedValue(
        Object.assign(new Error("bad request"), {
          response: { status: 400 },
        }),
      );

      const resultPromise = pollWhileBaseNotFound({
        initialResult: { testRun: null, baseNotFound: true },
        retryFn,
        fallbackFn,
      });
      const assertion = expect(resultPromise).rejects.toThrow("bad request");
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
      await assertion;

      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });
  });

  it("propagates an error that isn't the deployment being in progress", async () => {
    const retryFn = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("bad request"), { response: { status: 400 } }),
      );
    const fallbackFn = vi.fn();

    const resultPromise = pollWhileBaseNotFound({
      initialResult: { testRun: null, baseNotFound: true },
      retryFn,
      fallbackFn,
    });
    const assertion = expect(resultPromise).rejects.toThrow("bad request");
    await vi.advanceTimersByTimeAsync(30 * 1000);
    await assertion;

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
