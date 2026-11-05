import { describe, expect, it, vi } from "vitest";
import { pollUntilSessionCount } from "../sessions/poll-sessions";

const fakeClock = () => {
  let now = 0;
  return {
    now: () => now,
    sleep: vi.fn((ms: number) => {
      now += ms;
      return Promise.resolve();
    }),
  };
};

describe("pollUntilSessionCount", () => {
  it("polls until the minimum is reached", async () => {
    const clock = fakeClock();
    const responses = [["a"], ["a", "b"], ["a", "b", "c"]];
    const onProgress = vi.fn();
    const result = await pollUntilSessionCount({
      min: 3,
      timeoutSeconds: 600,
      intervalSeconds: 15,
      listSessionIds: () => Promise.resolve(responses.shift() ?? []),
      onProgress,
      ...clock,
    });
    expect(result).toEqual({
      reached: true,
      count: 3,
      sessionIds: ["a", "b", "c"],
      waitedSeconds: 30,
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("gives up at the timeout", async () => {
    const clock = fakeClock();
    const result = await pollUntilSessionCount({
      min: 5,
      timeoutSeconds: 40,
      intervalSeconds: 15,
      listSessionIds: () => Promise.resolve(["a"]),
      onProgress: () => undefined,
      ...clock,
    });
    expect(result).toMatchObject({
      reached: false,
      count: 1,
      waitedSeconds: 30,
    });
  });

  it("polls exactly once with a zero timeout", async () => {
    const list = vi.fn(() => Promise.resolve<string[]>([]));
    const result = await pollUntilSessionCount({
      min: 1,
      timeoutSeconds: 0,
      intervalSeconds: 15,
      listSessionIds: list,
      onProgress: () => undefined,
      ...fakeClock(),
    });
    expect(result.reached).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
