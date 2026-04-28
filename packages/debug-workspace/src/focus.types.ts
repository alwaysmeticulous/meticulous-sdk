/**
 * The kind of investigation that produced this debug workspace. Drives how the
 * focus is computed and which fields in {@link InvestigationFocus} are populated.
 *
 * - `replay-diff`: a replay-diff with no specific screenshot in mind. Focus =
 *   the screenshots that actually diverged (plus immediate event-number
 *   neighbours for context).
 * - `screenshot`: the user named a specific screenshot via `--screenshot`.
 *   Focus = just that screenshot across head + base.
 * - `single-replay`: a single replay with no diff context. No automatic focus.
 * - `free-form-replays`: multiple replays passed via `replays <ids..>` without
 *   a diff between them. No automatic focus.
 */
export type InvestigationKind =
  | "replay-diff"
  | "screenshot"
  | "single-replay"
  | "free-form-replays";

/**
 * A single focus screenshot. Carries enough information for the agent to
 * locate and reason about the screenshot without consulting the full
 * `screenshot-index.json` sidecar.
 */
export interface FocusScreenshot {
  /** Filename, e.g. `screenshot-after-event-00673.png`. */
  filename: string;
  /** Event number from the screenshot identifier (when applicable). */
  eventNumber: number | null;
  /** Head replay ID this screenshot belongs to, or `null` when only base exists. */
  headReplayId: string | null;
  /** Base replay ID this screenshot belongs to, or `null` when only head exists. */
  baseReplayId: string | null;
  /** Virtual time of the screenshot in the head replay (ms). */
  headVirtualTimeStart: number | null;
  /** Virtual time of the screenshot in the base replay (ms). */
  baseVirtualTimeStart: number | null;
  /** Mismatch fraction from the pixel diff (0..1). `null` if not a diff or unknown. */
  mismatchFraction: number | null;
  /** Mismatch as a human-readable percent string, e.g. `"0.4275%"`. `null` otherwise. */
  mismatchPercent: string | null;
  /** CSS class names of changed sections detected by the diff. Empty array if none / unknown. */
  changedSectionsClassNames: string[];
  /** `true` when this entry was added as a temporal neighbour, not because it itself diverged. */
  isNeighbor: boolean;
}

/**
 * Investigation focus block inlined into `context.json`. Tells the agent where
 * to anchor its analysis so it doesn't have to scan raw diff JSON files.
 *
 * If `primaryScreenshots` is empty (e.g. for free-form replay invocations or
 * when zero screenshots actually diverged) the agent should fall back to the
 * `screenshot-index.json` and `dom-diff-index.json` sidecars in `debug-data/`.
 */
export interface InvestigationFocus {
  kind: InvestigationKind;
  /** Screenshots the agent should investigate first. Bounded; see `MAX_FOCUS_SCREENSHOTS`. */
  primaryScreenshots: FocusScreenshot[];
  /** Sorted, deduplicated event numbers covering `primaryScreenshots`. */
  primaryEventNumbers: number[];
  /**
   * Virtual-time range (ms, inclusive) covering `primaryScreenshots` across
   * head and base. `null` when no entry has a virtual time.
   */
  primaryVtRange: { start: number; end: number } | null;
  /**
   * Total count of diffing screenshots discovered in the workspace, before
   * the {@link MAX_FOCUS_SCREENSHOTS} cap is applied. Lets the agent know
   * whether `primaryScreenshots` is truncated.
   */
  totalDiffingScreenshots: number;
}

/**
 * Reference written into `context.json` pointing the agent at a sidecar file
 * containing the full unfiltered map (e.g. `screenshot-index.json`,
 * `dom-diff-index.json`).
 */
export interface SidecarRef {
  /** Path relative to `debug-data/`. */
  $ref: string;
  /** Total number of entries in the sidecar. */
  count: number;
}
