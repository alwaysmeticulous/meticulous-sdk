import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureBuffer } from "../capture-buffer";
import type { RequestContext } from "../context";
import type { SidecarTransport } from "../sidecar-transport";
import { FIXED_DRAWS_BEFORE_PRNG, UNATTRIBUTED_DRAW } from "../virtual-random";

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

// One source line for every Math.random, so they share a call site. The first
// FIXED_DRAWS_BEFORE_PRNG draws are the constant; past that the PRNG starts.
const drawN = (n: number): number[] => {
  const draws: number[] = [];
  for (let i = 0; i < n; i++) {
    draws.push(Math.random());
  }
  return draws;
};

const drawThree = (): number[] => drawN(3);

const drawThreeAfterLimit = (): number[] =>
  drawN(FIXED_DRAWS_BEFORE_PRNG + 3).slice(FIXED_DRAWS_BEFORE_PRNG);

describe("installVirtualRandom", () => {
  it("returns the fixed constant for the first draws at a call site", async () => {
    const base = await inFreshIsolate(REPLAY_CONTEXT, drawThree);
    const head = await inFreshIsolate(REPLAY_CONTEXT, drawThree);
    expect(head).toEqual(base);
    expect(base).toEqual([
      UNATTRIBUTED_DRAW,
      UNATTRIBUTED_DRAW,
      UNATTRIBUTED_DRAW,
    ]);
  });

  it("starts a deterministic PRNG after the per-call-site fixed-draw limit", async () => {
    const base = await inFreshIsolate(REPLAY_CONTEXT, drawThreeAfterLimit);
    const head = await inFreshIsolate(REPLAY_CONTEXT, drawThreeAfterLimit);
    expect(head).toEqual(base);
    expect(new Set(base).size).toBe(3);
    expect(base.includes(UNATTRIBUTED_DRAW)).toBe(false);
  });

  it("returns the same crypto.randomUUID in both replays", async () => {
    const mint = () => globalThis.crypto.randomUUID();
    const base = await inFreshIsolate(REPLAY_CONTEXT, mint);
    expect(await inFreshIsolate(REPLAY_CONTEXT, mint)).toBe(base);
    expect(base).toBe("55555555-5555-4555-9555-555555555555");
  });

  it("mints distinct ids once a call site is past the fixed-draw limit", async () => {
    const ids = await inFreshIsolate(REPLAY_CONTEXT, () => {
      const minted: string[] = [];
      for (let i = 0; i < FIXED_DRAWS_BEFORE_PRNG + 3; i++) {
        minted.push(globalThis.crypto.randomUUID());
      }
      return minted.slice(FIXED_DRAWS_BEFORE_PRNG);
    });
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the PRNG seed independent of the stack, so a rebuild cannot shift it", async () => {
    // Past the fixed-draw limit the seed is the per-call-site counter alone, never the
    // call-site string. Two distinct sites, each seen for the first PRNG draw, both seed
    // at 0 and return the same first PRNG value.
    const fromA = () => Math.random();
    const fromB = () => Math.random();
    const exhaustThenDraw = (draw: () => number): number => {
      for (let i = 0; i < FIXED_DRAWS_BEFORE_PRNG; i++) {
        draw();
      }
      return draw();
    };
    const draws = await inFreshIsolate(REPLAY_CONTEXT, () => [
      exhaustThenDraw(fromA),
      exhaustThenDraw(fromB),
    ]);
    expect(draws[0]).toBe(draws[1]);
    expect(draws[0]).not.toBe(UNATTRIBUTED_DRAW);
  });

  it("gives different sessions different PRNG sequences", async () => {
    const sessionA = await inFreshIsolate(REPLAY_CONTEXT, drawThreeAfterLimit);
    const sessionB = await inFreshIsolate(
      { ...REPLAY_CONTEXT, frontendSessionId: "fs-random-2" },
      drawThreeAfterLimit,
    );
    expect(sessionB).not.toEqual(sessionA);
  });

  it("fills getRandomValues with the constant until the call site is past the limit", async () => {
    const draw = () => {
      const array = new Uint8Array(16);
      const returned = globalThis.crypto.getRandomValues(array);
      expect(returned).toBe(array);
      return Array.from(array);
    };
    const base = await inFreshIsolate(REPLAY_CONTEXT, draw);
    expect(await inFreshIsolate(REPLAY_CONTEXT, draw)).toEqual(base);
    expect(new Set(base).size).toBe(1);
    expect(base[0]).toBe(Math.floor(UNATTRIBUTED_DRAW * 256));
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

/**
 * An isolate outlives one replay and is reused for whichever replay lands on it next, so these
 * run several requests through a SINGLE loaded shim rather than a fresh one each time.
 */
const inSharedIsolate = async <T>(
  runs: { ctx: RequestContext; fn: () => T }[],
): Promise<T[]> => {
  restoreNatives();
  vi.resetModules();
  const [{ installVirtualRandom }, { requestCaptureContext }] =
    await Promise.all([import("../virtual-random"), import("../context")]);
  installVirtualRandom();
  return runs.map(({ ctx, fn }) => requestCaptureContext.run(ctx, fn));
};

describe("state is scoped per inbound request", () => {
  const replay = (replayId: string, requestId = "req-1"): RequestContext => ({
    ...REPLAY_CONTEXT,
    replayId,
    requestId,
  });

  it("gives a base and a head replay of one session identical draws on a shared isolate", async () => {
    const [base, head] = await inSharedIsolate([
      { ctx: replay("replay-base"), fn: drawThreeAfterLimit },
      { ctx: replay("replay-head"), fn: drawThreeAfterLimit },
    ]);
    expect(head).toEqual(base);
  });

  it("gives a retry the same draws as the replay it retries", async () => {
    const [, head, retry] = await inSharedIsolate([
      { ctx: replay("replay-base"), fn: drawThreeAfterLimit },
      { ctx: replay("replay-head"), fn: drawThreeAfterLimit },
      { ctx: replay("replay-head-retry"), fn: drawThreeAfterLimit },
    ]);
    expect(retry).toEqual(head);
  });

  it("is unaffected by other sessions sharing the isolate in the same chunk", async () => {
    const other: RequestContext = {
      ...REPLAY_CONTEXT,
      frontendSessionId: "fs-random-other",
      replayId: "replay-other",
    };
    const [alone] = await inSharedIsolate([
      { ctx: replay("replay-head"), fn: drawThreeAfterLimit },
    ]);
    const [, interleaved] = await inSharedIsolate([
      { ctx: other, fn: drawThreeAfterLimit },
      { ctx: replay("replay-head"), fn: drawThreeAfterLimit },
    ]);
    expect(interleaved).toEqual(alone);
  });

  it("matches what a cold isolate would have produced", async () => {
    const cold = await inFreshIsolate(
      replay("replay-head"),
      drawThreeAfterLimit,
    );
    const [, warm] = await inSharedIsolate([
      { ctx: replay("replay-base"), fn: drawThreeAfterLimit },
      { ctx: replay("replay-head"), fn: drawThreeAfterLimit },
    ]);
    expect(warm).toEqual(cold);
  });

  it("gives two requests of one replay the same first draws, not a continuation", async () => {
    // The flake this exists to stop: a shared per-replay stream lets the second request
    // continue the first's sequence, so a shuffle (or any other draw) depends on how many
    // requests of this session have already landed on the isolate.
    const [first, second] = await inSharedIsolate([
      { ctx: replay("replay-head", "req-1"), fn: drawThree },
      { ctx: replay("replay-head", "req-2"), fn: drawThree },
    ]);
    expect(second).toEqual(first);
    expect(first).toEqual([
      UNATTRIBUTED_DRAW,
      UNATTRIBUTED_DRAW,
      UNATTRIBUTED_DRAW,
    ]);
  });

  it("gives two requests of one replay the same PRNG tail after the fixed-draw limit", async () => {
    const [first, second] = await inSharedIsolate([
      { ctx: replay("replay-head", "req-1"), fn: drawThreeAfterLimit },
      { ctx: replay("replay-head", "req-2"), fn: drawThreeAfterLimit },
    ]);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(3);
  });

  it("does not let concurrent requests of one replay consume each other's stream", async () => {
    restoreNatives();
    vi.resetModules();
    const [{ installVirtualRandom }, { requestCaptureContext }] =
      await Promise.all([import("../virtual-random"), import("../context")]);
    installVirtualRandom();

    // One source line for every draw — sequences are keyed by stack, so four
    // Math.random() calls on four lines would be four call sites, each seeded at 0.
    const drawNext = (): number => Math.random();
    const requestA = replay("replay-head", "req-a");
    const requestB = replay("replay-head", "req-b");
    const interleavedA: number[] = [];
    const interleavedB: number[] = [];
    const turns = [
      { ctx: requestA, into: interleavedA },
      { ctx: requestB, into: interleavedB },
      { ctx: requestA, into: interleavedA },
      { ctx: requestB, into: interleavedB },
    ];
    for (const { ctx, into } of turns) {
      requestCaptureContext.run(ctx, () => into.push(drawNext()));
    }

    expect(interleavedA).toEqual(interleavedB);
    expect(interleavedA).toEqual([UNATTRIBUTED_DRAW, UNATTRIBUTED_DRAW]);
  });
});
