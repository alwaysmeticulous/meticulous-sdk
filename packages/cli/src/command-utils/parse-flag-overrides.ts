import { CliUserError } from "../utils/cli-user-error";

/**
 * Parses the `--flagOverrides` JSON object (flag name to string or boolean value)
 * that `simulate` forces through `window.Meticulous.context.getFlagOverride`.
 */
export const parseFlagOverrides = (
  value: string,
): Record<string, string | boolean> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidFlagOverridesError(value);
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalidFlagOverridesError(value);
  }
  const entries = Object.entries(parsed);
  for (const [name, flagValue] of entries) {
    if (typeof flagValue !== "string" && typeof flagValue !== "boolean") {
      throw new CliUserError(
        `Invalid --flagOverrides value for "${name}": ${JSON.stringify(flagValue)}. Values must be strings or booleans.`,
      );
    }
  }
  return Object.fromEntries(entries) as Record<string, string | boolean>;
};

const invalidFlagOverridesError = (value: string): CliUserError =>
  new CliUserError(
    `Invalid --flagOverrides: ${value}. Expected a JSON object such as '{"my_flag": true, "my_experiment": "treatment"}'.`,
  );
