import { afterEach, describe, expect, it, vi } from "vitest";
import { logProgress } from "@alwaysmeticulous/common";
import { CliUserError } from "../cli-user-error";
import {
  pollWhileProcessing,
  RESULT_POLL_INTERVAL_MS,
} from "../poll-while-processing";

vi.mock("@alwaysmeticulous/common", () => ({
  logProgress: vi.fn(),
}));

type Result = { status: "processing" } | { status: "complete"; value: number };

const isProcessing = (r: Result): r is { status: "processing" } =>
  r.status === "processing";

const options = {
  isProcessing,
  waitingMessage: () => "Waiting...",
  timeoutMessage: (last: { status: "processing" }) =>
    `Gave up while ${last.status}.`,
};

describe("pollWhileProcessing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a result that is ready at once without sleeping", async () => {
    const request = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValue({ status: "complete", value: 1 });

    const result = await pollWhileProcessing(request, options);

    expect(result).toEqual({ status: "complete", value: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("re-requests at the poll interval until the result is ready", async () => {
    const request = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "complete", value: 2 });
    vi.useFakeTimers();

    const pending = pollWhileProcessing(request, options);
    await vi.advanceTimersByTimeAsync(RESULT_POLL_INTERVAL_MS * 2);

    expect(await pending).toEqual({ status: "complete", value: 2 });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("computes the waiting message from the first processing response, logged once", async () => {
    vi.mocked(logProgress).mockClear();
    const request = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "complete", value: 3 });
    vi.useFakeTimers();

    const pending = pollWhileProcessing(request, {
      ...options,
      waitingMessage: (first: { status: "processing" }) =>
        `First response: ${first.status}.`,
    });
    await vi.advanceTimersByTimeAsync(RESULT_POLL_INTERVAL_MS * 2);
    await pending;

    expect(logProgress).toHaveBeenCalledTimes(1);
    expect(logProgress).toHaveBeenCalledWith("First response: processing.");
  });

  it("gives up with a user error naming the last state once the budget is spent", async () => {
    const request = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValue({ status: "processing" });
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0) // deadline base
      .mockReturnValueOnce(999_999_999); // first deadline check

    const rejection = pollWhileProcessing(request, options);

    await expect(rejection).rejects.toBeInstanceOf(CliUserError);
    await expect(rejection).rejects.toThrow("Gave up while processing.");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
