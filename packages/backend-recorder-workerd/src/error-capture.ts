/**
 * Capturing and reconstructing a thrown error, shared by every instrumentation that replays
 * failures rather than treating them as "nothing was recorded".
 *
 * Recording the error matters wherever the app's own behaviour depends on it: a call that
 * legitimately failed during recording (a constraint violation, a rejected payment) must replay
 * as the same failure, not as a miss. An uncaptured error replays as a hermetic "no recorded
 * result", which renders a different page and reads as a product change.
 *
 * What survives: `name`, `message` and every own enumerable property — which is where a JS
 * error carries the fields consumers actually branch on (`code`, `status`, `severity`). What
 * does not: the class. Reconstruction returns a plain `Error`, so `error.name ===
 * "PostgresError"` and `error.code` behave as recorded but `instanceof` does not match.
 *
 * It lives in this package, rather than in the Node recorder, because the workerd postgres.js
 * capture has to produce byte-identical JSON to the Node one — the same reason `kv-capture.ts`
 * is here. `packages/backend-recorder-js/src/error-capture-shared.ts` re-exports both halves.
 */

/**
 * Serializes a thrown value to a JSON string.
 *
 * `omitProps` names own properties to leave out — large debug payloads, or values that are
 * redundant with attributes the span already carries. `stack` is almost always in it: it is
 * recorded-process-specific and would be misleading replayed into another process.
 *
 * A non-`Error` throw (a string, an object) is captured by its `String()` form, which is what a
 * consumer would have seen from a `catch` that assumed an `Error`.
 */
export const serializeCapturedError = (
  error: unknown,
  omitProps: ReadonlySet<string>,
): string => {
  if (!(error instanceof Error)) {
    return JSON.stringify({ name: "Error", message: String(error) });
  }
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error)) {
    if (!omitProps.has(key)) {
      fields[key] = value;
    }
  }
  // `name`/`message` last so an own property of either name cannot shadow the real one.
  return JSON.stringify({
    ...fields,
    name: error.name,
    message: error.message,
  });
};

/**
 * Reconstructs a captured error. Both message fallbacks are the caller's, because they surface
 * in the app's own error handling and should name the technology that failed.
 */
export const deserializeCapturedError = (
  json: string,
  {
    unparseableMessage,
    fallbackMessage,
  }: { unparseableMessage: string; fallbackMessage: string },
): Error => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return new Error(unparseableMessage);
  }
  const { message, name, ...fields } = parsed;
  const error = Object.assign(
    new Error(typeof message === "string" ? message : fallbackMessage),
    fields,
  );
  if (typeof name === "string") {
    error.name = name;
  }
  return error;
};
