export const MAX_POOLED_STRINGS = 1_000_000;

/**
 * Replaces, in place, every string inside `value` with the first equal string
 * already in `pool` (adding it when unseen), and returns `value` — or the
 * pooled string when `value` is itself a string.
 *
 * `JSON.parse` allocates a fresh copy of every string it reads, and snapshot
 * files repeat the same strings across every stage of every session (the same
 * selector, markup and rule text recur in thousands of replays). Sharing one
 * copy per distinct value keeps a whole run's snapshots to a fraction of their
 * parsed size, without changing any value a check reads.
 *
 * Walks with an explicit stack rather than recursion, so nesting as deep as
 * `JSON.parse` accepts can't overflow the call stack.
 *
 * The pool stops growing at {@link MAX_POOLED_STRINGS}: V8 throws past ~16.7M
 * `Map` entries, and data that keeps producing new distinct strings gains
 * nothing from pooling. Strings already pooled keep being shared after that;
 * new ones are left as parsed.
 */
export const internStrings = <T>(value: T, pool: Map<string, string>): T => {
  if (typeof value === "string") {
    return internString(value, pool) as T;
  }
  const pending: object[] = isContainer(value) ? [value] : [];
  for (let container = pending.pop(); container; container = pending.pop()) {
    // A projector may return frozen shared values; writing to them throws in
    // strict mode, so read their children without replacing any.
    const writable = !Object.isFrozen(container);
    if (Array.isArray(container)) {
      for (let index = 0; index < container.length; index++) {
        const interned = internChild(container[index], pool, pending);
        if (writable) {
          container[index] = interned;
        }
      }
    } else {
      const record = container as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const interned = internChild(record[key], pool, pending);
        if (writable) {
          record[key] = interned;
        }
      }
    }
  }
  return value;
};

const internChild = (
  child: unknown,
  pool: Map<string, string>,
  pending: object[],
): unknown => {
  if (typeof child === "string") {
    return internString(child, pool);
  }
  if (isContainer(child)) {
    pending.push(child);
  }
  return child;
};

const internString = (value: string, pool: Map<string, string>): string => {
  const pooled = pool.get(value);
  if (pooled !== undefined) {
    return pooled;
  }
  if (pool.size < MAX_POOLED_STRINGS) {
    pool.set(value, value);
  }
  return value;
};

const isContainer = (value: unknown): value is object =>
  typeof value === "object" && value !== null;
