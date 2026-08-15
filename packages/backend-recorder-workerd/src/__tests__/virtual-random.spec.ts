import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureBuffer } from "../capture-buffer";
import type { RequestContext } from "../context";
import type { SidecarTransport } from "../sidecar-transport";

/**
 * Unit test for replay randomness virtualization, run in Node — which supplies
 * AsyncLocalStorage and WebCrypto, so the module runs unmodified. Real workerd's willingness
 * to have these globals replaced is covered by the Miniflare capability probe in
 * backend-recorder-js.
 */

const REPLAY_CONTEXT: RequestContext = {
  mode: "replay",
  requestId: "req-1",
  frontendSessionId: "fs-random-1",
  replayId: "replay-random-1",
  sidecarUrl: "http://127.0.0.1:9670",
  clockAnchorMs: 1_785_230_474_662,
  waitUntil: () => undefined,
};

const RECORD_TRANSPORT: SidecarTransport = {
  kind: "url",
  url: "http://127.0.0.1:9670",
};

const RECORD_CONTEXT: RequestContext = {
  mode: "record",
  requestId: "req-2",
  frontendSessionId: "fs-random-1",
  transport: RECORD_TRANSPORT,
  buffer: new CaptureBuffer(RECORD_TRANSPORT, () => undefined),
  traceId: "0".repeat(32),
  serverSpanId: "1".repeat(16),
  waitUntil: () => undefined,
};

const nativeMathRandom = Math.random;
const nativeRandomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
const nativeGetRandomValues = globalThis.crypto.getRandomValues.bind(
  globalThis.crypto,
);

const restoreNatives = (): void => {
  Math.random = nativeMathRandom;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: nativeRandomUUID,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis.crypto, "getRandomValues", {
    value: nativeGetRandomValues,
    configurable: true,
    writable: true,
  });
};

/**
 * Runs `fn` in a freshly loaded shim, which is what a new isolate serving a new replay gets.
 * Module state (the per-session sequences) starts empty each time, so calling this twice
 * models a base replay and a head replay of the same recording.
 */
const inFreshIsolate = async <T>(
  ctx: RequestContext,
  fn: () => T,
): Promise<T> => {
  restoreNatives();
  vi.resetModules();
  const [{ installVirtualRandom }, { requestCaptureContext }] =
    await Promise.all([import("../virtual-random"), import("../context")]);
  installVirtualRandom();
  return requestCaptureContext.run(ctx, fn);
};

beforeEach(() => {
  restoreNatives();
});

afterEach(() => {
  restoreNatives();
  vi.resetModules();
});

// Drawn in a loop, from one source line: repeated calls down the same path continue one
// sequence. Three calls written on three separate lines would be three distinct call sites,
// each seeded at 0, and would all return the same value.
const drawThree = (): number[] => {
  const draws: number[] = [];
  for (let i = 0; i < 3; i++) {
    draws.push(Math.random());
  }
  return draws;
};

describe("installVirtualRandom", () => {
  it("returns the same Math.random sequence in both replays", async () => {
    const base = await inFreshIsolate(REPLAY_CONTEXT, drawThree);
    const head = await inFreshIsolate(REPLAY_CONTEXT, drawThree);
    expect(head).toEqual(base);
    expect(new Set(base).size).toBe(3);
  });

  it("returns the same crypto.randomUUID in both replays", async () => {
    const mint = () => globalThis.crypto.randomUUID();
    const base = await inFreshIsolate(REPLAY_CONTEXT, mint);
    expect(await inFreshIsolate(REPLAY_CONTEXT, mint)).toBe(base);
    expect(base).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("mints distinct ids for repeated calls within a replay", async () => {
    // One source line, so all three mints continue one sequence — see drawThree.
    const ids = await inFreshIsolate(REPLAY_CONTEXT, () => {
      const minted: string[] = [];
      for (let i = 0; i < 3; i++) {
        minted.push(globalThis.crypto.randomUUID());
      }
      return minted;
    });
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the seed independent of the stack, so a rebuild cannot shift it", async () => {
    // The seed is built from the per-call-site counter alone, never the call-site string —
    // bundle filenames and line numbers differ between a base and a head build of the same
    // code. Two distinct sites, each seen for the first time, therefore both seed at 0 and
    // return the same first draw. That equality is the observable proof the string stayed out
    // of the seed, and it doubles as the guard on the stack-frame counting: had the call site
    // resolved to our own patched global, both calls would land in ONE sequence and the second
    // would advance it.
    const fromA = () => Math.random();
    const fromB = () => Math.random();
    const draws = await inFreshIsolate(REPLAY_CONTEXT, () => [
      fromA(),
      fromB(),
    ]);
    expect(draws[0]).toBe(draws[1]);
  });

  it("gives different sessions different sequences", async () => {
    const sessionA = await inFreshIsolate(REPLAY_CONTEXT, drawThree);
    const sessionB = await inFreshIsolate(
      { ...REPLAY_CONTEXT, frontendSessionId: "fs-random-2" },
      drawThree,
    );
    expect(sessionB).not.toEqual(sessionA);
  });

  it("fills getRandomValues deterministically and returns the array", async () => {
    const draw = () => {
      const array = new Uint8Array(16);
      const returned = globalThis.crypto.getRandomValues(array);
      expect(returned).toBe(array);
      return Array.from(array);
    };
    const base = await inFreshIsolate(REPLAY_CONTEXT, draw);
    expect(await inFreshIsolate(REPLAY_CONTEXT, draw)).toEqual(base);
    expect(new Set(base).size).toBeGreaterThan(1);
  });

  it("leaves recording and non-request work on the native generators", async () => {
    const whileRecording = await inFreshIsolate(RECORD_CONTEXT, () => [
      Math.random(),
      Math.random(),
      globalThis.crypto.randomUUID(),
    ]);
    const alsoWhileRecording = await inFreshIsolate(RECORD_CONTEXT, () => [
      Math.random(),
      Math.random(),
      globalThis.crypto.randomUUID(),
    ]);
    expect(alsoWhileRecording).not.toEqual(whileRecording);
  });
});
