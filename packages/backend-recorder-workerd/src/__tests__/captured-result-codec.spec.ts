import { describe, expect, it } from "vitest";
import {
  deserializeCapturedResult,
  serializeCapturedResult,
} from "../captured-result-codec";

const roundTrip = (value: unknown): unknown =>
  deserializeCapturedResult(serializeCapturedResult(value));

describe("captured result codec", () => {
  it("round-trips the JSON types unchanged", () => {
    const value = {
      id: "abc",
      count: 7,
      enabled: false,
      missing: null,
      nested: [{ deep: { deeper: ["x", 1] } }],
    };
    expect(roundTrip(value)).toEqual(value);
  });

  it("round-trips a Date as a Date", () => {
    const recorded = roundTrip({
      org: { createdAt: new Date("2026-06-19T20:29:05.047Z") },
    }) as { org: { createdAt: Date } };

    expect(recorded.org.createdAt).toBeInstanceOf(Date);
    expect(recorded.org.createdAt.toISOString()).toBe(
      "2026-06-19T20:29:05.047Z",
    );
  });

  it("round-trips Dates nested in arrays", () => {
    const recorded = roundTrip([
      { updatedAt: new Date("2026-07-14T11:12:55.708Z") },
    ]) as { updatedAt: Date }[];

    expect(recorded[0].updatedAt).toBeInstanceOf(Date);
  });

  it("keeps an invalid Date invalid rather than dropping the type", () => {
    const recorded = roundTrip({ at: new Date(NaN) }) as { at: Date };

    expect(recorded.at).toBeInstanceOf(Date);
    expect(Number.isNaN(recorded.at.getTime())).toBe(true);
  });

  it("captures a BigInt instead of throwing", () => {
    // `JSON.stringify` rejects a BigInt outright, which used to mean the whole operation
    // went uncaptured and missed at replay.
    expect(roundTrip({ total: 9007199254740993n })).toEqual({
      total: 9007199254740993n,
    });
  });

  it("round-trips binary as bytes", () => {
    const recorded = roundTrip({
      blob: new Uint8Array([0, 1, 254, 255]),
    }) as { blob: Uint8Array };

    expect(recorded.blob).toBeInstanceOf(Uint8Array);
    expect([...recorded.blob]).toEqual([0, 1, 254, 255]);
  });

  it("round-trips non-finite numbers rather than nulling them", () => {
    expect(roundTrip({ a: NaN, b: Infinity, c: -Infinity })).toEqual({
      a: NaN,
      b: Infinity,
      c: -Infinity,
    });
  });

  it("round-trips null, undefined and scalar results", () => {
    expect(roundTrip(null)).toBeNull();
    expect(roundTrip(undefined)).toBeUndefined();
    expect(roundTrip(4)).toBe(4);
    expect(roundTrip("row")).toBe("row");
  });

  it("throws on a cyclic result, as JSON.stringify does", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => serializeCapturedResult(cyclic)).toThrow();
  });

  it("leaves an app value that looks like a tag alone", () => {
    const value = { __meticulousType: "Date", value: "not ours" };
    expect(roundTrip({ row: value })).toEqual({ row: value });
  });

  describe("recordings written before the codec existed", () => {
    it("recovers timestamps that were flattened to ISO strings", () => {
      const legacy = JSON.stringify([
        { org: { createdAt: "2026-06-19T20:29:05.047Z", name: "acme" } },
      ]);

      const recorded = deserializeCapturedResult(legacy) as {
        org: { createdAt: Date; name: string };
      }[];
      expect(recorded[0].org.createdAt).toBeInstanceOf(Date);
      expect(recorded[0].org.createdAt.toISOString()).toBe(
        "2026-06-19T20:29:05.047Z",
      );
      expect(recorded[0].org.name).toBe("acme");
    });

    it("leaves strings that are not exactly a UTC millisecond timestamp", () => {
      const legacy = JSON.stringify({
        date: "2026-06-19",
        noMillis: "2026-06-19T20:29:05Z",
        offset: "2026-06-19T20:29:05.047+01:00",
        impossible: "2026-13-45T99:29:05.047Z",
        prefixed: "at 2026-06-19T20:29:05.047Z",
      });

      expect(deserializeCapturedResult(legacy)).toEqual(JSON.parse(legacy));
    });

    it("serves a recorded null", () => {
      expect(deserializeCapturedResult("null")).toBeNull();
    });
  });

  it("does not apply the legacy guess to a payload this codec wrote", () => {
    const recorded = roundTrip({ slug: "2026-06-19T20:29:05.047Z" }) as {
      slug: unknown;
    };
    expect(recorded.slug).toBe("2026-06-19T20:29:05.047Z");
  });
});
