/**
 * Investigation focus and sidecar references inlined into `context.json`.
 *
 * The goal is to keep the SessionStart payload bounded: instead of the agent
 * receiving the full screenshot map for every replay, it gets a focused list
 * of "primary" screenshots to anchor on, plus references to sidecar files
 * (`screenshot-index.json`, `dom-diff-index.json`) holding the full data on
 * disk.
 */
export type InvestigationKind = "replay-diff" | "screenshot" | "other";

export interface FocusScreenshot {
  /** Filename, e.g. `screenshot-after-event-00673.png`. */
  filename: string;
  /** Event number from the screenshot identifier (when applicable). */
  eventNumber: number | null;
  /** Head replay this screenshot belongs to, or `null` when only base exists. */
  headReplayId: string | null;
  /** Base replay this screenshot belongs to, or `null` when only head exists. */
  baseReplayId: string | null;
  /** Mismatch fraction from the pixel diff (0..1). `null` when not from a diff. */
  mismatchFraction: number | null;
}

export interface InvestigationFocus {
  /**
   * - `replay-diff` -- focus is the screenshots that actually diverged.
   * - `screenshot` -- focus is the single screenshot named via `--screenshot`.
   * - `other` -- single replay, free-form replays, or no diffs to anchor on;
   *   agent should fall back to the sidecars.
   */
  kind: InvestigationKind;
  /** Screenshots the agent should investigate first. Capped at 50 entries. */
  primaryScreenshots: FocusScreenshot[];
  /** Sorted, deduplicated event numbers covering `primaryScreenshots`. */
  primaryEventNumbers: number[];
  /**
   * Inclusive virtual-time range (ms) covering `primaryScreenshots` across
   * head and base. `null` when no entry has a virtual time.
   */
  primaryVtRange: { start: number; end: number } | null;
  /**
   * Total diffing screenshots discovered before the cap. If this is larger
   * than `primaryScreenshots.length`, the focus is truncated and the agent
   * should consult `screenshot-index.json` for the full list.
   */
  totalDiffingScreenshots: number;
}

/** Reference to a sidecar file written next to `context.json`. */
export interface SidecarRef {
  /** Path relative to `debug-data/`. */
  $ref: string;
  /** Total number of entries in the sidecar. */
  count: number;
}
