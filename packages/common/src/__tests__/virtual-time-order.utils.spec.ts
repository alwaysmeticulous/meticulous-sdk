import { describe, expect, it } from "vitest";
import { getVirtualTimeOrder } from "../virtual-time-order.utils";

describe("getVirtualTimeOrder", () => {
  it("returns nothing for entries in order, counting ties and a missing virtual time as 0ms", () => {
    expect(getVirtualTimeOrder([undefined, 0, 100, 100])).toBeUndefined();
  });

  it("returns the positions in sorted order when an entry started before the one listed ahead of it", () => {
    expect(getVirtualTimeOrder([100, undefined, 100, 50])).toEqual([
      1, 3, 0, 2,
    ]);
  });
});
