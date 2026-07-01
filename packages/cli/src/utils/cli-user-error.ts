/**
 * Thrown by command helpers (e.g. `resolveProjectIdentifier`,
 * `handleAuthFailure`) when the command cannot proceed for a reason that
 * is the user's responsibility — not a bug. `wrapHandler` prints the
 * message and exits with the supplied code, without the generic
 * `--help` tip or a stack trace.
 *
 * Use this instead of `process.exit(1)` inside utilities so that exit
 * happens in one place (the top-level handler) and tests can assert on
 * thrown behavior rather than process-level side effects.
 */
export type CliUserErrorSeverity = "error" | "warn";

export class CliUserError extends Error {
  readonly exitCode: number;
  readonly severity: CliUserErrorSeverity;

  constructor(
    message: string,
    exitCode = 1,
    severity: CliUserErrorSeverity = "error",
  ) {
    super(message);
    this.name = "CliUserError";
    this.exitCode = exitCode;
    this.severity = severity;
  }
}
