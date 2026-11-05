import {
  MAX_AGENT_DIFF_DECISION_BATCH_SIZE,
  type AgentDiffBatchItem,
  type AgentDiffBatchResponse,
} from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";
import { printJson } from "../../command-utils/print-json";

/** The single-diff options `--diffs` stands in for. */
const SINGLE_DIFF_OPTIONS = [
  "replayDiffId",
  "screenshotName",
  "reason",
  "x",
  "y",
] as const;

/** How approve-diff, reject-diff and ignore-diff take several diffs at once. */
export const DIFF_BATCH_NOTE = `Pass --diffs instead of --replayDiffId and --screenshotName to decide on up to ${MAX_AGENT_DIFF_DECISION_BATCH_SIZE} screenshot diffs of one test run in a single call, recorded all or nothing; it then outputs a TSV table with columns replayDiffId and screenshotName, plus commentId where the diff got a review comment, one row per diff in the order given.`;

export const diffBatchOption = (entryFields: string) =>
  ({
    diffs: {
      string: true,
      description: `The screenshot diffs to decide on, all from one test run, as a JSON array of objects with ${entryFields}. Pass either this or --replayDiffId and --screenshotName.`,
    },
  }) as const;

/**
 * The parsed `--diffs`, or `null` when the call names a single diff instead.
 * Checks the shape only; what each entry requires is left to the backend, as
 * for a single diff.
 */
export const parseDiffBatch = (
  options: { diffs?: string | undefined } & Partial<
    Record<(typeof SINGLE_DIFF_OPTIONS)[number], unknown>
  >,
): AgentDiffBatchItem[] | null => {
  if (options.diffs == null) {
    return null;
  }
  const named = SINGLE_DIFF_OPTIONS.filter((option) => options[option] != null);
  if (named.length > 0) {
    throw new CliUserError(
      `--diffs cannot be combined with ${named.map((option) => `--${option}`).join(", ")}: give each diff's fields inside --diffs instead.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.diffs);
  } catch (error) {
    throw new CliUserError(
      `--diffs is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (entry) =>
        entry == null || typeof entry !== "object" || Array.isArray(entry),
    )
  ) {
    throw new CliUserError("--diffs must be a JSON array of objects.");
  }
  return parsed as AgentDiffBatchItem[];
};

/**
 * The single-diff options, required when `--diffs` isn't given. yargs can't
 * demand them, since `--diffs` replaces them.
 */
export const requireSingleDiffOption = <T>(
  option: (typeof SINGLE_DIFF_OPTIONS)[number],
  value: T | undefined,
): T => {
  if (value == null) {
    throw new CliUserError(
      `Missing required argument: ${option} (or pass --diffs).`,
    );
  }
  return value;
};

export const printDiffBatch = (
  response: AgentDiffBatchResponse,
  json: boolean,
): void => {
  if (json) {
    printJson(response);
    return;
  }
  console.log(["replayDiffId", "screenshotName", "commentId"].join("\t"));
  for (const { replayDiffId, screenshotName, commentId } of response) {
    console.log([replayDiffId, screenshotName, commentId ?? ""].join("\t"));
  }
};
