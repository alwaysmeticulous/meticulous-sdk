import type { AtifObservationResult } from "../types/atif.types";

/**
 * Key in an observation result's `extra` for the wall-clock milliseconds
 * between the tool call and its result, as recorded by the harness or derived
 * from transcript timestamps. Absent when the harness doesn't record it.
 */
export const ATIF_EXTRA_DURATION_MS = "duration_ms";

export const getToolResultDurationMs = (
  result: AtifObservationResult,
): number | null => {
  const value = result.extra?.[ATIF_EXTRA_DURATION_MS];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
};
