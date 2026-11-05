import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_PARTS,
  getMaxArchiveBytes,
  getPartSize,
} from "../part-size-schedule";

const MiB = 1024 * 1024;
const SERVER_PART_SIZE = 50 * MiB;

describe("part size schedule", () => {
  it("starts with 8MiB parts so small builds upload in 8MiB parts", () => {
    for (let part = 1; part <= 8; part++) {
      expect(getPartSize(part, SERVER_PART_SIZE)).toBe(8 * MiB);
    }
  });

  it("ramps up to the server part size", () => {
    expect(getPartSize(9, SERVER_PART_SIZE)).toBe(16 * MiB);
    expect(getPartSize(17, SERVER_PART_SIZE)).toBe(32 * MiB);
    expect(getPartSize(25, SERVER_PART_SIZE)).toBe(SERVER_PART_SIZE);
    expect(getPartSize(MAX_UPLOAD_PARTS, SERVER_PART_SIZE)).toBe(
      SERVER_PART_SIZE,
    );
  });

  it("never exceeds the server part size and never goes below 5MiB (S3 minimum)", () => {
    for (const serverSize of [5 * MiB, 10 * MiB, 50 * MiB]) {
      for (let part = 1; part <= MAX_UPLOAD_PARTS; part++) {
        const size = getPartSize(part, serverSize);
        expect(size).toBeLessThanOrEqual(serverSize);
        expect(size).toBeGreaterThanOrEqual(5 * MiB);
      }
    }
  });

  it("keeps at least 80% of the capacity of 100 fixed 50MiB parts", () => {
    const capacity = getMaxArchiveBytes(SERVER_PART_SIZE);

    expect(capacity).toBe((8 * 8 + 8 * 16 + 8 * 32 + 76 * 50) * MiB);
    expect(capacity / (MAX_UPLOAD_PARTS * SERVER_PART_SIZE)).toBeGreaterThan(
      0.8,
    );
  });
});
