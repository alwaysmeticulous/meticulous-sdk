import { requestCaptureContext } from "./context";
import { warnOnce } from "./log";
import { captureOutboundCall } from "./outbound-capture";

/**
 * Records calls made through Cloudflare bindings (`env.MY_SERVICE.fetch(...)`).
 *
 * The `globalThis.fetch` patch cannot see these: a binding's `fetch` is a method on a host
 * object, and workerd routes it as an internal subrequest that never touches the global. So
 * the binding's *prototype* method is patched instead — the same move the Node recorder makes
 * on `Redis.prototype.sendCommand`.
 *
 * The prototype is reached from an instance found on `env`, never from a global name: in
 * workerd there is no `globalThis.Fetcher` (the runtime type is a bare TypeScript alias, not
 * one of the exposed runtime classes). Reaching it through an instance is also what makes
 * this work at all for an app that reads its bindings from `cloudflare:workers` instead of
 * the handler argument — that module hands out a *different* `env` object but the *same*
 * binding instances, so the prototype we patch is shared either way.
 *
 * Verified against real workerd in
 * `packages/backend-recorder-js/src/__tests__/workerd-binding-patch.spec.ts`, which also
 * pins the properties this relies on: `fetch` is inherited and configurable, the receiver
 * survives, one patch covers every service binding plus Durable Object stubs, and a binding
 * call is not also counted as a `globalThis.fetch` call.
 */

// Symbol.for so a second copy of the shim (e.g. bundled twice) still detects the patch.
const BINDING_FETCH_PATCHED = Symbol.for("meticulous.workerd.bindingPatched");

/**
 * Bindings never recorded, by name.
 *
 * An assets binding is shape-identical to a service binding — same prototype, same `fetch` —
 * so it cannot be told apart by duck-typing and has to be skipped by name. Recording it would
 * push every static asset through the body capture cap for no benefit: asset bytes are large
 * and often binary, and asset serving is typically the highest-volume call a worker makes.
 */
const DEFAULT_SKIPPED_BINDINGS = ["ASSETS", "__STATIC_CONTENT"] as const;

/** Identifies a binding instance so its calls can be attributed to an `env` key. */
const bindingNames = new WeakMap<object, string>();
const skippedBindings = new WeakSet<object>();

interface FetcherLike {
  fetch: (...args: unknown[]) => Promise<Response>;
}

type BindingFetch = (...args: unknown[]) => Promise<Response>;

export interface InstallBindingPatchOptions {
  /** Extra binding names to leave unrecorded, on top of the defaults. */
  skipBindings?: readonly string[];
}

/**
 * Discovers Fetcher-shaped bindings on `env` and patches their shared prototype so their
 * `fetch` calls are recorded. Safe to call on every request — discovery is cheap and the
 * patch itself is applied once per prototype per isolate.
 *
 * Never throws: a runtime that does not permit the patch simply goes unrecorded.
 */
export const installBindingPatch = (
  env: unknown,
  options?: InstallBindingPatchOptions,
): void => {
  try {
    for (const { name, value, skip } of fetcherBindings(
      env,
      options?.skipBindings,
    )) {
      // Patch even a skipped binding's prototype: it is shared with every other
      // Fetcher-shaped binding (and is in a Durable Object stub's prototype chain), so
      // seeding it is what gives those coverage. Skipping is enforced per instance at call
      // time, not by declining to patch.
      patchBindingPrototype(value);
      if (skip) {
        skippedBindings.add(value);
        continue;
      }
      bindingNames.set(value, name);
    }
  } catch (error) {
    warnOnce(
      "binding-patch-install",
      "Failed to install the Meticulous binding patch — binding calls will not be recorded.",
      error,
    );
  }
};

interface DiscoveredBinding {
  name: string;
  value: object;
  skip: boolean;
}

const fetcherBindings = (
  env: unknown,
  extraSkipped: readonly string[] | undefined,
): DiscoveredBinding[] => {
  if (env === null || typeof env !== "object") {
    return [];
  }
  const skipped = new Set<string>([
    ...DEFAULT_SKIPPED_BINDINGS,
    ...(extraSkipped ?? []),
  ]);
  const found: DiscoveredBinding[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (isFetcherLike(value)) {
      found.push({ name, value, skip: skipped.has(name) });
    }
  }
  return found;
};

/**
 * A binding we can record: something with a `fetch` method. Durable Object *namespaces* are
 * excluded — they have no `fetch`; it is the stub from `namespace.get()` that does, and that
 * stub inherits the same prototype, so it is covered without being discovered here.
 */
const isFetcherLike = (value: unknown): value is object & FetcherLike =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as Partial<FetcherLike>).fetch === "function";

const patchBindingPrototype = (binding: object): void => {
  const prototype = Object.getPrototypeOf(binding) as
    | (object & Record<symbol, unknown>)
    | null;
  if (prototype === null || prototype[BINDING_FETCH_PATCHED] === true) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "fetch");
  if (
    descriptor === undefined ||
    typeof descriptor.value !== "function" ||
    descriptor.configurable !== true
  ) {
    // Either `fetch` is an own per-instance property or the runtime has locked the
    // prototype. Recording binding calls is not possible; everything else keeps working.
    warnOnce(
      "binding-patch-unsupported",
      "This runtime does not expose a patchable binding `fetch` — binding calls will not be recorded.",
    );
    return;
  }

  const original = descriptor.value as BindingFetch;
  Object.defineProperty(prototype, "fetch", {
    value: patchedBindingFetch(original),
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(prototype, BINDING_FETCH_PATCHED, {
    value: true,
    enumerable: false,
    configurable: true,
  });
};

/**
 * A `function`, not an arrow: `this` is the binding the call was made on, and it must be
 * forwarded to the original or workerd throws "Illegal invocation".
 */
const patchedBindingFetch = (original: BindingFetch): BindingFetch =>
  function (this: unknown, ...args: unknown[]): Promise<Response> {
    const passThrough = (): Promise<Response> => original.apply(this, args);

    const ctx = requestCaptureContext.getStore();
    // Record mode only. `installBindingPatch` is not called for a replay request, but the
    // patch is per-isolate: a record request could have installed it earlier, and a replay
    // request must not be teed into a sidecar that has no exporter behind it.
    if (!ctx || ctx.mode !== "record") {
      return passThrough();
    }
    const receiver =
      typeof this === "object" && this !== null ? this : undefined;
    if (receiver !== undefined && skippedBindings.has(receiver)) {
      return passThrough();
    }

    const request = toRequest(args);
    if (request === undefined) {
      return passThrough();
    }

    // Defence in depth: a binding pointed at the sidecar must not be recorded. Forwards
    // `request`, not `args` — normalizing may already have consumed the original body.
    if (request.url.startsWith(`${ctx.sidecarUrl}/`)) {
      return original.apply(this, [request]);
    }

    const bindingName =
      receiver !== undefined ? bindingNames.get(receiver) : undefined;
    return captureOutboundCall(
      ctx,
      { kind: "binding", bindingName },
      request,
      (req) => original.apply(this, [req]),
    );
  };

/**
 * Normalizes the call's arguments to a single Request, or undefined if they cannot be
 * represented (in which case the call passes through untouched and the runtime produces its
 * own error).
 *
 * A lone `Request` is passed along as-is rather than rebuilt: `new Request(existing)` drops
 * workerd's `cf` property, which the receiving worker may read.
 */
const toRequest = (args: unknown[]): Request | undefined => {
  try {
    const [input, init] = args;
    if (input instanceof Request && init === undefined) {
      return input;
    }
    return new Request(input as RequestInfo, init as RequestInit | undefined);
  } catch {
    return undefined;
  }
};
