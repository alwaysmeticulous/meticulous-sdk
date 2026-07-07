import { CliUserError } from "../utils/cli-user-error";

/**
 * Parse the `--jsonArgs` / `--rawJson` value: a JSON object whose keys are
 * merged onto the parsed argv (the agent/programmatic way to pass options).
 * Throws a `CliUserError` — rather than letting a raw `SyntaxError` escape as an
 * uncaught stack trace — so malformed input surfaces as a clean message.
 *
 * Every key is validated against `knownKeys` (every option/alias the CLI
 * declares). This is what would otherwise be yargs' `.strict()` check — the
 * merge onto argv bypasses it — and, since the merge is a plain
 * `Object.assign`, rejecting unknown keys also closes off prototype-polluting
 * ones (`__proto__`, `constructor`, …), which are never option names.
 */
export const parseJsonArgs = (
  jsonArgs: string,
  knownKeys: Set<string>,
): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonArgs);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliUserError(`--jsonArgs must be a valid JSON string: ${detail}`);
  }
  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    throw new CliUserError(
      '--jsonArgs must be a JSON object, e.g. \'{"apiToken":"..."}\'.',
    );
  }
  for (const key of Object.keys(parsed)) {
    if (!knownKeys.has(key)) {
      throw new CliUserError(`--jsonArgs contains an unknown option "${key}".`);
    }
  }
  return parsed as Record<string, unknown>;
};
