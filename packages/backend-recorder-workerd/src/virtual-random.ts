import { requestCaptureContext } from "./context";
import { warnOnce } from "./log";

/**
 * Per-session randomness virtualization for replay mode.
 *
 * Mocking every outbound `fetch` is not enough to make a replay deterministic: a Worker that
 * mints an id (`crypto.randomUUID()` for a guest id, `getRandomValues` for a token) produces
 * a different value in the base replay than in the head replay, so the rendered HTML differs
 * and any screenshot showing that value diffs forever. This replaces the worker's sources of
 * randomness with seeded generators while serving a replayed request, so two replays of the
 * same recorded session render identically.
 *
 * Deliberately a *generator*, not a recording: like the browser replayer we do not capture
 * the numbers the original session produced, we produce fresh ones from a fixed seed. The
 * app still sees plausible random values, and two replays see the same ones.
 *
 * Ported from the Node backend recorder's `replay/virtual-random.ts`, which in turn mirrors
 * the browser replayer's `mockOutRandomNumberGeneration`, including its butterfly-effect
 * containment: a separate sequence per call stack, seeded from a per-call-site counter, so a
 * change in one part of the app does not shift the numbers another part gets, and a shared
 * helper called from two places does not return the same value twice. Two differences from
 * the Node version, both forced by the runtime:
 *
 *   - the session comes from the request context rather than a session resolver with a
 *     process-wide fallback, because workerd's AsyncLocalStorage propagates reliably from the
 *     inbound handler;
 *   - only the globals workerd actually has are patched — there is no `node:crypto` module to
 *     mutate.
 *
 * Reads outside a replayed request — module evaluation, a recording, a deployed production
 * worker — fall through to the native generators untouched.
 */

const nativeMathRandom = Math.random.bind(Math);
const nativeRandomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
const nativeGetRandomValues = globalThis.crypto?.getRandomValues?.bind(
  globalThis.crypto,
);

/**
 * Frames of the stack that belong to this module and must be skipped to reach the app's call
 * site, counted from the `new Error()` inside {@link getCallStack}.
 *
 * Getting this wrong degrades gracefully rather than breaking: a call site that resolves to
 * one of our own frames merges sequences that should have been separate, which costs
 * butterfly-effect isolation but is still perfectly deterministic.
 */
const FRAMES_TO_APP = 3; // getCallStack ← openSequence ← patched global ← app

/** How much of the stack identifies a sequence. Ten frames tells call paths apart cheaply. */
const STACK_FRAMES = 10;

/** Stack captures per session, after which sequences are keyed by call site alone. */
const MAX_STACK_CAPTURES = 10_000;

/** Bounds the state a stream of unrecognised session ids can accumulate in one isolate. */
const MAX_TRACKED_SESSIONS = 50;

const UNKNOWN_CALL_SITE = "unknown";

interface SessionRandomState {
  frontendSessionId: string;
  generatorBySequenceKey: Map<string, () => number>;
  nextCallerIdByCallSite: Map<string, number>;
  stackCaptures: number;
}

const stateBySession = new Map<string, SessionRandomState>();

// ---------------------------------------------------------------------------
// Seeded PRNG (Alea)
// ---------------------------------------------------------------------------

/**
 * Alea, the same algorithm the browser replayer gets from `seedrandom`. Inlined because this
 * package is published to npm and ships no runtime dependencies — a customer's Worker bundle
 * should not grow for this.
 */
export const createSeededRandom = (seed: string): (() => number) => {
  let n = 0xefc8249d;
  const mash = (data: string): number => {
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    return (n >>> 0) * 2.3283064365386963e-10;
  };

  let s0 = mash(" ");
  let s1 = mash(" ");
  let s2 = mash(" ");
  let c = 1;
  s0 -= mash(seed);
  if (s0 < 0) {
    s0 += 1;
  }
  s1 -= mash(seed);
  if (s1 < 0) {
    s1 += 1;
  }
  s2 -= mash(seed);
  if (s2 < 0) {
    s2 += 1;
  }

  return () => {
    const t = 2091639 * s0 + c * 2.3283064365386963e-10;
    s0 = s1;
    s1 = s2;
    c = t | 0;
    s2 = t - c;
    return s2;
  };
};

// ---------------------------------------------------------------------------
// Sequence resolution
// ---------------------------------------------------------------------------

const getCallStack = (): { stack: string; site: string } => {
  const originalLimit = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = FRAMES_TO_APP + STACK_FRAMES;
    const stack = new Error().stack;
    if (stack == null) {
      return { stack: UNKNOWN_CALL_SITE, site: UNKNOWN_CALL_SITE };
    }
    // Line 0 is the "Error" header; frame lines follow, innermost first, and the first
    // FRAMES_TO_APP of them are ours.
    const lines = stack.split("\n").slice(FRAMES_TO_APP + 1);
    return {
      stack: lines.join("\n") || UNKNOWN_CALL_SITE,
      site: lines[0] ?? UNKNOWN_CALL_SITE,
    };
  } catch {
    return { stack: UNKNOWN_CALL_SITE, site: UNKNOWN_CALL_SITE };
  } finally {
    Error.stackTraceLimit = originalLimit;
  }
};

const getSessionState = (): SessionRandomState | undefined => {
  const ctx = requestCaptureContext.getStore();
  if (ctx === undefined || ctx.mode !== "replay") {
    return undefined;
  }
  const existing = stateBySession.get(ctx.frontendSessionId);
  if (existing !== undefined) {
    return existing;
  }
  if (stateBySession.size >= MAX_TRACKED_SESSIONS) {
    const oldest = stateBySession.keys().next();
    if (!oldest.done) {
      stateBySession.delete(oldest.value);
    }
  }
  const created: SessionRandomState = {
    frontendSessionId: ctx.frontendSessionId,
    generatorBySequenceKey: new Map(),
    nextCallerIdByCallSite: new Map(),
    stackCaptures: 0,
  };
  stateBySession.set(ctx.frontendSessionId, created);
  return created;
};

/**
 * The generator for the sequence the current call belongs to, or undefined outside a
 * replayed request.
 *
 * Sequences are keyed by the whole call stack, so a second call down the same path continues
 * the same sequence and gets a different value. The *seed* comes from a counter kept per
 * immediate call site, which is what keeps a shared id helper honest: two call paths through
 * the same `generateId()` share a call site, so they are seeded 0 and 1 and return different
 * ids.
 *
 * Note what the seed deliberately does NOT contain: any part of the stack. Base and head are
 * different builds of the app, so the same logical call site has a different string in each —
 * a seed built from it would change on every rebuild. The consequence, which the browser
 * replayer shares, is that two *distinct* call sites each seen for the first time both seed at
 * 0 and hand out the same first value. That is the accepted trade: an alternative that
 * separated them (say, an ordinal per call site) would shift every later site's values as soon
 * as a PR added one randomness call, which is the butterfly effect this whole scheme exists to
 * avoid.
 */
const openSequence = (): (() => number) | undefined => {
  const state = getSessionState();
  if (state === undefined) {
    return undefined;
  }

  let sequenceKey = UNKNOWN_CALL_SITE;
  let callSite = UNKNOWN_CALL_SITE;
  if (state.stackCaptures < MAX_STACK_CAPTURES) {
    state.stackCaptures++;
    const captured = getCallStack();
    sequenceKey = captured.stack;
    callSite = captured.site;
  }

  const existing = state.generatorBySequenceKey.get(sequenceKey);
  if (existing !== undefined) {
    return existing;
  }
  const callerId = state.nextCallerIdByCallSite.get(callSite) ?? 0;
  // Seeded from the counter only — never from the call-site or stack string itself. Those embed
  // bundle filenames and line numbers, which differ between the base build and the head build
  // of the very same code, so putting one in the seed would reseed every sequence on any
  // rebuild and bring back exactly the diffs this exists to remove. The strings are grouping
  // keys, nothing more.
  const generator = createSeededRandom(
    `meticulous-random-${state.frontendSessionId}-${callerId}`,
  );
  state.generatorBySequenceKey.set(sequenceKey, generator);
  state.nextCallerIdByCallSite.set(callSite, callerId + 1);
  return generator;
};

// ---------------------------------------------------------------------------
// Derived primitives
// ---------------------------------------------------------------------------

const HEX = "0123456789abcdef";
/** The two bits of a v4 UUID's variant field are fixed, leaving these four values. */
const VARIANT = "89ab";

const buildUuid = (draw: () => number): string => {
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += VARIANT[Math.floor(draw() * VARIANT.length)];
    } else {
      uuid += HEX[Math.floor(draw() * HEX.length)];
    }
  }
  return uuid;
};

/**
 * Fills the view's bytes rather than its elements, so every typed array — including the
 * BigInt ones, whose elements cannot be assigned a number — is handled by one path.
 */
const fillBytes = (view: ArrayBufferView, draw: () => number): void => {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(draw() * 256);
  }
};

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

let installed = false;

/**
 * Replaces the worker's sources of randomness with per-session seeded generators. Idempotent,
 * and a no-op failure: a worker that will not let them be replaced still replays, just
 * without randomness virtualisation.
 *
 * Called lazily from the replay branch of the request wrapper rather than at module scope,
 * for the same reasons as the virtual clock: record mode and deployed production workers then
 * pay nothing, and the package declares no `sideEffects`, so a module-scope side effect could
 * legitimately be tree-shaken away by a customer's bundler.
 */
export const installVirtualRandom = (): void => {
  if (installed) {
    return;
  }
  installed = true;
  try {
    Math.random = () => openSequence()?.() ?? nativeMathRandom();

    if (globalThis.crypto != null) {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: (): string => {
          const draw = openSequence();
          if (draw !== undefined) {
            return buildUuid(draw);
          }
          return nativeRandomUUID?.() ?? buildUuid(nativeMathRandom);
        },
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis.crypto, "getRandomValues", {
        value: <T extends ArrayBufferView>(array: T): T => {
          const draw = openSequence();
          if (draw === undefined) {
            return nativeGetRandomValues?.(array) ?? array;
          }
          fillBytes(array, draw);
          return array;
        },
        configurable: true,
        writable: true,
      });
    }
  } catch (error) {
    warnOnce(
      "virtual-random",
      "Could not install the Meticulous replay random-number generators — ids minted by the app will differ between replays.",
      error,
    );
  }
};
