import { availableParallelism } from "os";
import { describe, expect, it } from "vitest";
import { getCompressionConcurrency } from "../compression-concurrency";

const files =
  (contents: Record<string, string>) =>
  (path: string): string | null =>
    contents[path] ?? null;

const noCgroup = files({});
const expectedUncapped = Math.min(16, Math.max(2, availableParallelism() - 1));

describe("getCompressionConcurrency", () => {
  it("uses one thread per core minus one, capped at 16, without a CPU quota", () => {
    expect(getCompressionConcurrency({}, noCgroup)).toBe(expectedUncapped);
  });

  it("caps threads at a cgroup v2 CPU quota", () => {
    expect(
      getCompressionConcurrency(
        {},
        files({ "/sys/fs/cgroup/cpu.max": "400000 100000\n" }),
      ),
    ).toBe(Math.min(expectedUncapped, 3));
  });

  it("rounds a fractional quota up and keeps at least two threads", () => {
    expect(
      getCompressionConcurrency(
        {},
        files({ "/sys/fs/cgroup/cpu.max": "150000 100000\n" }),
      ),
    ).toBe(2);
  });

  it("ignores an unlimited cgroup v2 quota", () => {
    expect(
      getCompressionConcurrency(
        {},
        files({ "/sys/fs/cgroup/cpu.max": "max 100000\n" }),
      ),
    ).toBe(expectedUncapped);
  });

  it("caps threads at a cgroup v1 CPU quota", () => {
    expect(
      getCompressionConcurrency(
        {},
        files({
          "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "400000\n",
          "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000\n",
        }),
      ),
    ).toBe(Math.min(expectedUncapped, 3));
  });

  it("ignores an unlimited cgroup v1 quota", () => {
    expect(
      getCompressionConcurrency(
        {},
        files({
          "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "-1\n",
          "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000\n",
        }),
      ),
    ).toBe(expectedUncapped);
  });

  it.each([
    ["1", 1],
    ["6", 6],
    ["64", 16],
  ])(
    "uses METICULOUS_COMPRESSION_CONCURRENCY=%s over the quota",
    (value, expected) => {
      expect(
        getCompressionConcurrency(
          { METICULOUS_COMPRESSION_CONCURRENCY: value },
          files({ "/sys/fs/cgroup/cpu.max": "200000 100000\n" }),
        ),
      ).toBe(expected);
    },
  );

  it.each(["0", "-3", "lots"])(
    "ignores an invalid METICULOUS_COMPRESSION_CONCURRENCY=%s",
    (value) => {
      expect(
        getCompressionConcurrency(
          { METICULOUS_COMPRESSION_CONCURRENCY: value },
          noCgroup,
        ),
      ).toBe(expectedUncapped);
    },
  );
});
