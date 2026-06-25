import type {
  HarRequest,
  HarResponse,
} from "./sdk-bundle-api/sdk-to-bundle/har-log";

/**
 * Types for authoring custom checks. A custom check compares the snapshots
 * captured during the base and head replays of a test run and returns a verdict
 * plus a report that is surfaced in the Meticulous UI.
 */

/**
 * A piece of data captured at a point during a replay, to be compared by a
 * custom check. A check may receive multiple snapshots sharing the same `type`,
 * `sessionId` and `stageDuringSession`; it should align the base and head
 * snapshots and base its verdict only on the differences (pre-existing issues
 * are ignored, consistent with Meticulous's semantics).
 */
export interface Snapshot<T = unknown> {
  /** The snapshot kind, e.g. "network-requests" or a customer-defined type. */
  type: string;

  /** The recorded session the snapshot was captured during. */
  sessionId: string;

  /**
   * Short, human readable description of what the user was doing in the session
   * (e.g. "Added an item to the cart"), useful for labelling the session in a
   * check's report. `undefined`/`null` when the session has no description (e.g.
   * older or unselected sessions), so checks must not rely on it being present.
   */
  sessionDescription?: string | null;

  /**
   * Where in the session the snapshot was captured, identified by the screenshot
   * taken at that point (e.g. "screenshot-after-event-2", "final-state").
   */
  stageDuringSession: string;

  data: T;

  /**
   * Version number the snapshot was recorded with (see
   * `recordCustomSnapshot`). Defaults to 0 for snapshots recorded without one
   * (including all built-in snapshots). When the version differs between the
   * base and head snapshots, a failing check can be caveated in the UI.
   */
  versionNumber?: number;
}

/** The base and head snapshots passed to a custom check. */
export interface CustomCheckInput {
  baseSnapshots: Snapshot[];
  headSnapshots: Snapshot[];
}

/**
 * The outcome of comparing the base and head snapshots:
 * - `pass`: no regression; the check is green and no report is surfaced.
 * - `warn-without-requiring-user-ack`: the check surfaces a report to the user,
 *   but does not require them to acknowledge (review) it.
 * - `warn-and-require-user-ack`: the check surfaces a report that the user is
 *   asked to acknowledge (review) before the run is considered actioned.
 *
 * A check failing to *run* is not a verdict: an execution error applies to the
 * custom check results as a whole (every check), not to an individual check, so
 * it is reported at that level rather than as a per-check verdict.
 */
export type CustomCheckVerdict =
  | "pass"
  | "warn-without-requiring-user-ack"
  | "warn-and-require-user-ack";

/**
 * Maximum length of a custom check `summary`. The summary is rendered inline in
 * the UI, so it is truncated to this many characters when displayed rather than
 * relying on plugin authors to keep it short.
 */
export const CUSTOM_CHECK_SUMMARY_MAX_LENGTH = 500;

/** The result a custom check returns after comparing the snapshots. */
export interface CustomCheckOutput {
  verdict: CustomCheckVerdict;

  /**
   * A short summary shown inline in the UI, e.g. "+30mb inc bundle size".
   * Truncated to {@link CUSTOM_CHECK_SUMMARY_MAX_LENGTH} characters when displayed.
   */
  summary?: string;

  report: CustomCheckReport;
}

/** A report rendered in the UI when the check is opened. Markdown for now. */
export type CustomCheckReport = MarkdownReport;

export interface MarkdownReport {
  type: "markdown";
  markdown: string;
}

/**
 * The contract a custom check implements: `execute` compares the base and head
 * snapshots and returns a verdict and report.
 */
export interface CustomCheck {
  execute: (input: CustomCheckInput) => Promise<CustomCheckOutput>;
}

/**
 * Manifest describing a custom check plugin to Meticulous. It sits alongside the
 * built entrypoint and is loaded (without executing the check) so the check can
 * be discovered ahead of time.
 */
export interface CustomCheckPluginManifest {
  /** Stable identifier for the check, e.g. "accessibility-check". */
  id: string;

  type: "custom-check";

  /** Plugin version, e.g. "1.0.0". */
  version: string;

  configuration: {
    /** Name shown in the UI, e.g. "Accessibility". */
    displayName: string;

    /** The snapshot types this check consumes, e.g. ["network-requests"]. */
    handlesSnapshotTypes: string[];

    /** Path to the built entrypoint, relative to the manifest, e.g. "./entrypoint.js". */
    entryPoint: string;
  };
}

/** A Meticulous plugin manifest. Only custom checks are supported today. */
export type PluginManifest = CustomCheckPluginManifest;

/**
 * The snapshot `type` of the built-in network requests snapshot. Checks that
 * consume it receive `Snapshot<NetworkRequestSnapshotData>` values.
 */
export const NETWORK_REQUESTS_SNAPSHOT_TYPE = "network-requests";

/**
 * `data` of a built-in "network-requests" snapshot: a single xhr/fetch request
 * captured during the replay, with the stubbed response that was served.
 *
 * `requestBody`/`responseBody` may be truncated (large bodies are ellipsized
 * with an MD5 of the remainder, so body changes are still detectable); url,
 * method, status and headers are captured in full.
 */
export interface NetworkRequestSnapshotData {
  url: string;
  method: string;
  requestHeaders: HarRequest["headers"];
  requestBody?: string;

  /** Status of the response served, or null if the request was not matched. */
  status: number | null;
  responseHeaders: HarResponse["headers"];
  responseBody?: string;

  /** Whether the request was matched to a recorded request and stubbed. */
  matched: boolean;
}

/**
 * Status of the custom check results reported for a test run as a whole:
 * - `complete`: the run finished and produced a verdict for every check.
 * - `execution-error`: computing the custom checks failed (e.g. the script
 *   threw before producing results). This is a property of the run as a whole,
 *   not of any individual check — an individual check only ever has a
 *   {@link CustomCheckVerdict}.
 */
export const CUSTOM_CHECK_RESULTS_STATUSES = [
  "complete",
  "execution-error",
] as const;

export type CustomCheckResultsStatus =
  (typeof CUSTOM_CHECK_RESULTS_STATUSES)[number];

/**
 * A single custom check's result: a {@link CustomCheckOutput} (verdict, summary
 * and report) tagged with the check's id.
 */
export interface ReportedCustomCheckResult extends CustomCheckOutput {
  /** Stable identifier of the check, e.g. "accessibility-check". */
  checkId: string;
}

/**
 * The custom check results computed for a test run, reported in a single call to
 * `reportCustomCheckResults`. Either every check's result (`status: "complete"`),
 * or a single execution error for the run as a whole (`status: "execution-error"`).
 */
export type ReportCustomCheckResultsRequest =
  | {
      status: "complete";
      checks: ReportedCustomCheckResult[];
    }
  | {
      status: "execution-error";
      error: string;
    };
