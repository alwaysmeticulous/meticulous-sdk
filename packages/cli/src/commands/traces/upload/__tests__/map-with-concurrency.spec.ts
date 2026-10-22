import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("keeps results in order with at most `limit` calls in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency([5, 1, 3, 2, 4], 2, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, n));
      inFlight--;
      return n * 10;
    });

    expect(results).toEqual([50, 10, 30, 20, 40]);
    expect(maxInFlight).toBe(2);
  });
});
