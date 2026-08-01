import { requestCaptureContext } from "./context";
import { warnOnce } from "./log";

/**
 * Freezes the worker's wall clock at the replayed session's last recorded activity.
 *
 * Without this, replay fails even when every outbound call is mocked correctly: credentials
 * minted during the recording (Firebase session cookies, OAuth access tokens) carry
 * short expiries, so by replay time the app rejects its own recorded credentials as stale.
 * Anchoring at the *end* of the recording means everything minted mid-session is already
 * issued but not yet expired.
 *
 * Ported from the Node backend recorder's replay clock, with two differences:
 *   - the anchor comes from the request context rather than a session→anchor map, because
 *     workerd's AsyncLocalStorage propagates reliably from the inbound handler. The Node
 *     version needs a process-wide "most recently seen session" fallback, which can
 *     resolve the wrong session on a replica serving several at once;
 *   - the busy-wait breaker schedules on `setTimeout` — workerd has no `setImmediate`.
 *
 * Only `Date` is patched, matching the Node implementation's scope (no `Intl`, no
 * `Temporal`, no timer virtualisation).
 */

const OriginalDate = globalThis.Date;

/** Real wall clock, immune to the patch below. */
export const nativeDateNow = (): number => OriginalDate.now();

// ---------------------------------------------------------------------------
// Busy-wait loop breaker
// ---------------------------------------------------------------------------

// A frozen clock makes `while (Date.now() < deadline) {}` spin forever. Count reads that
// return the same frozen value and, past the threshold, nudge the result forward 1ms per
// extra read until the loop's deadline is met. The nudge is a pure function of the repeat
// count, so a base and head replay break an identical loop identically.
const BREAK_AFTER = 20_000;

let lastLoopBreakBaseMs = 0;
let sameKeyCount = 0;
let loopBreakResetScheduled = false;

const applyLoopBreak = (baseMs: number): number => {
  // Reset at the end of the current macrotask. A synchronous busy-wait blocks the loop so
  // this cannot fire, letting the counter accumulate until it breaks the spin; once the
  // turn yields, the reset runs and the next turn starts fresh.
  if (!loopBreakResetScheduled) {
    loopBreakResetScheduled = true;
    try {
      setTimeout(() => {
        sameKeyCount = 0;
        loopBreakResetScheduled = false;
      }, 0);
    } catch {
      // Timers throw outside a request context in workerd. Nothing to reset in that case,
      // since clock reads there fall through to the real clock anyway.
      loopBreakResetScheduled = false;
    }
  }

  if (baseMs === lastLoopBreakBaseMs) {
    sameKeyCount++;
  } else {
    lastLoopBreakBaseMs = baseMs;
    sameKeyCount = 0;
  }
  return sameKeyCount <= BREAK_AFTER
    ? baseMs
    : baseMs + (sameKeyCount - BREAK_AFTER);
};

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * The virtual "now" for the request currently executing, or null when it is not a replay or
 * carries no anchor — in which case callers use the real clock. Reads outside any request
 * (module evaluation, background work) always get the real clock.
 */
const resolveVirtualNow = (): number | null => {
  const ctx = requestCaptureContext.getStore();
  if (ctx === undefined || ctx.mode !== "replay") {
    return null;
  }
  return ctx.clockAnchorMs === undefined
    ? null
    : applyLoopBreak(ctx.clockAnchorMs);
};

// ---------------------------------------------------------------------------
// Date shim
// ---------------------------------------------------------------------------

/**
 * What `Date.now()` reports. A standalone function rather than only a class static, so the
 * callable shim below can reuse it without referencing an unbound method — it touches no
 * `this`, so there is nothing to lose.
 */
const virtualDateNow = (): number => {
  const virtualNow = resolveVirtualNow();
  return virtualNow === null ? OriginalDate.now() : virtualNow;
};

// `Date` is heavily overloaded; capture args loosely and forward every explicit form
// unchanged. Only the zero-arg form reads "now" and is virtualized.
class VirtualDateClass extends OriginalDate {
  constructor(...args: unknown[]) {
    if (args.length > 0) {
      super(...(args as ConstructorParameters<typeof OriginalDate>));
      return;
    }
    const virtualNow = resolveVirtualNow();
    if (virtualNow === null) {
      super();
      return;
    }
    super(virtualNow);
  }

  static override now(): number {
    return virtualDateNow();
  }
}

// Classes cannot be called without `new`, but native `Date()` can be (returning a string),
// so wrap the class in a plain function supporting both.
function VirtualDate(this: unknown, ...args: unknown[]): Date | string {
  if (!(this instanceof VirtualDate)) {
    return new VirtualDateClass().toString();
  }
  return new VirtualDateClass(...args);
}

VirtualDate.now = virtualDateNow;
VirtualDate.parse = OriginalDate.parse;
VirtualDate.UTC = OriginalDate.UTC;

// Share the prototype so `new Date() instanceof Date` holds and every Date.prototype
// method resolves on instances.
Object.defineProperty(VirtualDate, "prototype", {
  value: VirtualDateClass.prototype,
  writable: false,
  configurable: false,
});
(VirtualDateClass.prototype as { constructor: unknown }).constructor =
  VirtualDate;

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

let installed = false;

/**
 * Replaces the global `Date` with the per-request virtual clock. Idempotent, and a no-op
 * failure: a worker that will not let its `Date` be replaced still replays, just without
 * clock virtualisation.
 *
 * Called lazily from the replay branch of the request wrapper rather than at module scope:
 * record mode and deployed production workers then pay nothing, and the package declares no
 * `sideEffects`, so a module-scope side effect could legitimately be tree-shaken away by a
 * customer's bundler.
 */
export const installVirtualClock = (): void => {
  if (installed) {
    return;
  }
  installed = true;
  try {
    globalThis.Date = VirtualDate as unknown as DateConstructor;
  } catch (error) {
    warnOnce(
      "virtual-clock",
      "Could not install the Meticulous replay clock — recorded credentials may be treated as expired.",
      error,
    );
  }
};
