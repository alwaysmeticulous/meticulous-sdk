import { isFetchError } from "@alwaysmeticulous/client";

/**
 * The `{ reason, message }` body the agent API attaches to a request it declines
 * as a caller mistake rather than a fault. Commands match on `reason` (never the
 * prose) to turn those into a clean `CliUserError`, so a genuine failure still
 * reaches the generic error path and Sentry.
 */
export const errorResponseBody = (
  error: unknown,
): { reason?: string; message?: string } | undefined =>
  isFetchError(error)
    ? (error.response?.data as
        | { reason?: string; message?: string }
        | undefined)
    : undefined;
