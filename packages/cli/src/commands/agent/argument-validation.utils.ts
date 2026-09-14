import { CliUserError } from "../../utils/cli-user-error";

/**
 * yargs' `demandOption` only asserts that a flag was *named*, not that it
 * carries a value. `--screenshotName --json` and an unquoted shell variable
 * that expanded to nothing both reach the handler as `""`, and an unquoted
 * variable holding two words reaches it as one value containing a space —
 * shells other than bash (zsh, fish) don't split on expansion, so a loop like
 * `set -- $pair` is a routine way to produce exactly that.
 *
 * These values are interpolated straight into a request path, so without a
 * check the caller's first sight of the mistake is a 404 for a URL they never
 * wrote, naming a host they have no context for.
 */

/** Rejects a required argument that was named but left without a value. */
export const requireArgument = (flag: string, value: string): string => {
  if (value.trim() === "") {
    throw new CliUserError(`--${flag} was given no value.`);
  }
  return value;
};

/**
 * As {@link requireArgument}, and additionally rejects whitespace inside the
 * value. Identifiers and screenshot names never contain any, so whitespace
 * means two arguments arrived as one — the message says so, because the
 * mistake is in the caller's quoting rather than in the value itself.
 */
export const requireIdArgument = (flag: string, value: string): string => {
  requireArgument(flag, value);
  if (/\s/.test(value)) {
    throw new CliUserError(
      `--${flag} contains whitespace: "${value}". This is usually an unquoted ` +
        `shell variable that expanded to more than one word — quote it, or pass ` +
        `each argument separately.`,
    );
  }
  return value;
};
