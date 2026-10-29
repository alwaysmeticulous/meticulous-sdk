import type { Options as YargsOptions } from "yargs";

export const LOG_LEVEL_OPTION = {
  string: true,
  choices: ["trace", "debug", "info", "warn", "error", "silent"],
  description: "Log level",
} satisfies YargsOptions;

/**
 * For command groups (`agent`, `download`) whose output is meant to be piped:
 * only warnings and errors by default, so `--logLevel info` is needed to also
 * see progress. Pair with `.middleware(routeLogsToStderr)`, so that whatever
 * the level, stdout carries only the result the command prints itself.
 *
 * Only the default is overridden: yargs appends `choices` on every
 * redeclaration, so repeating them would list each choice twice in `--help`.
 */
export const RESULT_ONLY_LOG_OPTIONS = {
  logLevel: { default: "warn" },
  verbose: {
    boolean: true,
    hidden: true,
    deprecated: "use --logLevel info instead",
    description: "Deprecated alias for --logLevel info.",
  },
} satisfies Record<string, YargsOptions>;

/**
 * `--verbose` only replaces the groups' "warn" default: yargs fills that in
 * whether or not `--logLevel` was passed, so any other level is explicit and
 * wins. Without a level, `quiet` (`--json`) lowers the default to "warn".
 */
export const resolveLogLevel = ({
  logLevel,
  verbose,
  quiet,
}: {
  logLevel: string | undefined;
  verbose: boolean;
  quiet: boolean;
}): string | undefined => {
  if (verbose && (logLevel === undefined || logLevel === "warn")) {
    return "info";
  }
  return logLevel ?? (quiet ? "warn" : undefined);
};
