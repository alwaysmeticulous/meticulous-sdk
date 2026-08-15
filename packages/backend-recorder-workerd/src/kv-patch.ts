import { type RequestCaptureContext, requestCaptureContext } from "./context";
import { type KvCaptureOutcome, serializeKvCaptureFields } from "./kv-capture";
import { warnOnce } from "./log";
import type { KvOperation, KvOperationEvent } from "./protocol";

/**
 * Records operations on Cloudflare KV namespace bindings (`env.MY_KV.get(key)`).
 *
 * KV is invisible to both the `globalThis.fetch` patch and the binding patch: a namespace is
 * a host object with no `fetch`, and workerd services its methods internally rather than as
 * a subrequest. So the namespace's *prototype* methods are patched instead — the same move
 * `binding-patch.ts` makes on a Fetcher, and the Node recorder on `Redis.prototype.sendCommand`.
 *
 * The prototype is reached from an instance found on `env`: as with bindings there is no
 * global to name, and going through an instance is what makes this work for an app that reads
 * its bindings from `cloudflare:workers` rather than the handler argument — that module hands
 * out a different `env` object but the same namespace instances, so the prototype is shared
 * either way.
 *
 * Verified against real workerd in `packages/backend-recorder-js/src/__tests__/`:
 * `workerd-binding-patch.spec.ts` pins the property shape this relies on (every recorded
 * method inherited and configurable, one prototype across namespaces), and
 * `workerd-kv-sidecar.spec.ts` drives real KV through the patch end to end.
 */

// Marks a patched method, rather than the prototype holding it: methods can live at different
// depths of one chain, and a base prototype can be shared with another binding type, so
// "already ours" has to be answerable per function. Symbol.for so a second copy of the shim
// (e.g. bundled twice) still detects the patch.
const KV_PATCHED = Symbol.for("meticulous.workerd.kvPatched");

/**
 * The methods recorded, and the shape a KV namespace is recognised by.
 *
 * `getWithMetadata` is what separates KV from R2: an R2 bucket also has `get`, `put`,
 * `delete` and `list`, so without it a bucket would be duck-typed as a namespace and its
 * (large, binary) objects pushed through value capture.
 */
const RECORDED_KV_METHODS = [
  "get",
  "getWithMetadata",
  "put",
  "delete",
  "list",
] as const;

/**
 * The namespaces being recorded, and the `env` key each was found under.
 *
 * Doubles as the allow-list: only an instance in here is recorded. A skipped namespace is
 * simply never registered, and — since the patch can land on a prototype shared with another
 * binding type — nothing that is not a discovered KV namespace can be recorded by accident.
 */
const kvBindingNames = new WeakMap<object, string>();

type KvMethod = (...args: unknown[]) => Promise<unknown>;

type KvNamespaceLike = Record<KvOperation, KvMethod>;

export interface InstallKvPatchOptions {
  /** Binding names to leave unrecorded. */
  skipBindings?: readonly string[];
  /**
   * Binding instances to leave unrecorded, whatever they are called. Accepted for symmetry with
   * the binding patch — a KV namespace is never the sidecar, so nothing uses it today.
   */
  skipInstances?: readonly object[];
}

/**
 * Discovers KV namespace bindings on `env` and patches their shared prototype so their
 * operations are recorded. Safe to call on every request — discovery is cheap and the patch
 * itself is applied once per prototype per isolate.
 *
 * Never throws: a runtime that does not permit the patch simply goes unrecorded.
 */
export const installKvPatch = (
  env: unknown,
  options?: InstallKvPatchOptions,
): void => {
  try {
    for (const { name, value, skip } of kvBindings(
      env,
      options?.skipBindings,
      options?.skipInstances,
    )) {
      // Patch even a skipped namespace's methods: they are shared with every other namespace,
      // so seeding them is what gives those coverage. Skipping is enforced by leaving the
      // instance off the allow-list below, not by declining to patch.
      patchKvMethods(value);
      if (!skip) {
        kvBindingNames.set(value, name);
      }
    }
  } catch (error) {
    warnOnce(
      "kv-patch-install",
      "Failed to install the Meticulous KV patch — KV operations will not be recorded.",
      error,
    );
  }
};

interface DiscoveredKvBinding {
  name: string;
  value: object;
  skip: boolean;
}

const kvBindings = (
  env: unknown,
  skipBindings: readonly string[] | undefined,
  skipInstances: readonly object[] | undefined,
): DiscoveredKvBinding[] => {
  if (env === null || typeof env !== "object") {
    return [];
  }
  const skipped = new Set<string>(skipBindings ?? []);
  const skippedInstances = new Set<object>(skipInstances ?? []);
  const found: DiscoveredKvBinding[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (isKvNamespaceLike(value)) {
      found.push({
        name,
        value,
        skip: skipped.has(name) || skippedInstances.has(value),
      });
    }
  }
  return found;
};

const isKvNamespaceLike = (value: unknown): value is object & KvNamespaceLike =>
  value !== null &&
  typeof value === "object" &&
  RECORDED_KV_METHODS.every(
    (method) =>
      typeof (value as Record<string, unknown>)[method] === "function",
  );

/**
 * Patches every recorded method, or none of them: a half-patched namespace would record a
 * partial view of the app's KV usage, which is worse than recording none of it, because
 * nothing in the recording would say which half is missing. So the whole chain is resolved
 * first, and only then patched.
 *
 * Each method is patched where it actually lives rather than on the instance's immediate
 * prototype — workerd already puts an inherited method further up the chain for Durable
 * Object stubs, so assuming one flat prototype is not safe.
 */
const patchKvMethods = (binding: object): void => {
  const owners = new Map<KvOperation, MethodOwner>();
  for (const method of RECORDED_KV_METHODS) {
    const owner = findMethodOwner(binding, method);
    if (owner === undefined) {
      // Either the method is an own per-instance property or the runtime has locked the
      // prototype. Recording KV is not possible; everything else keeps working.
      warnOnce(
        "kv-patch-unsupported",
        `This runtime does not expose a patchable KV \`${method}\` — KV operations will not be recorded.`,
      );
      return;
    }
    owners.set(method, owner);
  }

  for (const [method, { owner, original }] of owners) {
    if ((original as unknown as Record<symbol, unknown>)[KV_PATCHED] === true) {
      continue;
    }
    Object.defineProperty(owner, method, {
      value: patchedKvMethod(method, original),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
};

interface MethodOwner {
  owner: object;
  original: KvMethod;
}

/**
 * The prototype whose `method` a call on `instance` would reach, or undefined if there is none
 * or it cannot be replaced. The search stops at the first prototype that *has* the property,
 * patchable or not: that is the one a call resolves to, so anything further up is shadowed.
 */
const findMethodOwner = (
  instance: object,
  method: KvOperation,
): MethodOwner | undefined => {
  if (Object.hasOwn(instance, method)) {
    // An own per-instance method would shadow anything we patched on the prototype.
    return undefined;
  }
  let current: object | null = Object.getPrototypeOf(instance) as object | null;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, method);
    if (descriptor !== undefined) {
      return typeof descriptor.value === "function" &&
        descriptor.configurable === true
        ? { owner: current, original: descriptor.value as KvMethod }
        : undefined;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
};

/**
 * A `function`, not an arrow: `this` is the namespace the call was made on, and it must be
 * forwarded to the original or workerd throws "Illegal invocation".
 */
const patchedKvMethod = (
  operation: KvOperation,
  original: KvMethod,
): KvMethod => {
  const patched = function (
    this: unknown,
    ...args: unknown[]
  ): Promise<unknown> {
    const passThrough = (): Promise<unknown> => original.apply(this, args);

    const ctx = requestCaptureContext.getStore();
    // Record mode only. `installKvPatch` is not called for a replay request, but the patch is
    // per-isolate: a record request could have installed it earlier, and no mock store serves
    // KV, so a replay request must reach the real namespace.
    if (!ctx || ctx.mode !== "record") {
      return passThrough();
    }
    const receiver =
      typeof this === "object" && this !== null ? this : undefined;
    // Only namespaces discovered on `env` are recorded — see `kvBindingNames`.
    const bindingName =
      receiver === undefined ? undefined : kvBindingNames.get(receiver);
    if (bindingName === undefined) {
      return passThrough();
    }

    return captureKvOperation(ctx, operation, bindingName, args, passThrough);
  };
  Object.defineProperty(patched, KV_PATCHED, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return patched;
};

/**
 * Records an operation without affecting it: the real method runs untouched and its result is
 * returned as-is, with the event reported in the background via `ctx.waitUntil`. Any capture
 * failure is warned about once and swallowed — recording must never break the app.
 */
const captureKvOperation = async (
  ctx: RequestCaptureContext,
  operation: KvOperation,
  bindingName: string,
  args: unknown[],
  invoke: () => Promise<unknown>,
): Promise<unknown> => {
  const startTimeMs = Date.now();
  let result: unknown;
  try {
    result = await invoke();
  } catch (error) {
    report(ctx, operation, bindingName, args, startTimeMs, {
      error: String(error),
    });
    throw error;
  }
  report(ctx, operation, bindingName, args, startTimeMs, { result });
  return result;
};

const report = (
  ctx: RequestCaptureContext,
  operation: KvOperation,
  bindingName: string,
  args: unknown[],
  startTimeMs: number,
  outcome: KvCaptureOutcome,
): void => {
  try {
    ctx.buffer.add(
      buildKvEvent(ctx, operation, bindingName, args, startTimeMs, outcome),
    );
  } catch (error) {
    warnOnce("kv-report", "Failed to report a KV operation.", error);
  }
};

const buildKvEvent = (
  ctx: RequestCaptureContext,
  operation: KvOperation,
  bindingName: string,
  args: unknown[],
  startTimeMs: number,
  outcome: KvCaptureOutcome,
): KvOperationEvent => ({
  kind: "kv",
  requestId: ctx.requestId,
  ...(ctx.frontendSessionId !== undefined
    ? { frontendSessionId: ctx.frontendSessionId }
    : {}),
  traceId: ctx.traceId,
  serverSpanId: ctx.serverSpanId,
  bindingName,
  operation,
  ...serializeKvCaptureFields(operation, args, outcome),
  startTimeMs,
  endTimeMs: Date.now(),
  ...("error" in outcome ? { error: outcome.error } : {}),
});
