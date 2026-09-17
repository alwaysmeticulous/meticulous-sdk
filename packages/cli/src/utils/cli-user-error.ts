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
export type CliUserErrorOutcome = "failed" | "skipped";

export interface CliUserErrorMetadata {
  outcome?: CliUserErrorOutcome;
  reason?: string;
}

export class CliUserError extends Error {
  readonly exitCode: number;
  readonly severity: CliUserErrorSeverity;
  readonly outcome: CliUserErrorOutcome;
  readonly reason: string | undefined;

  constructor(
    message: string,
    exitCode = 1,
    severity: CliUserErrorSeverity = "error",
    metadata: CliUserErrorMetadata = {},
  ) {
    super(message);
    this.name = "CliUserError";
    this.exitCode = exitCode;
    this.severity = severity;
    this.outcome = metadata.outcome ?? "failed";
    this.reason = metadata.reason;
  }
}
