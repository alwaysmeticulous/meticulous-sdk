import { serializeJson } from "@alwaysmeticulous/common/json";

/**
 * Prints a value as pretty-printed JSON on stdout — the single formatting
 * decision (2-space indent, trailing newline) shared by every command's
 * `--json` output, so machine-readable output stays consistent.
 */
export const printJson = (value: unknown): void => {
  console.log(serializeJson(value));
};
