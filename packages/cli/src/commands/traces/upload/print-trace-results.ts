import type { SkippedTracePath } from "@alwaysmeticulous/agent-traces";
import { logNotice } from "@alwaysmeticulous/common";
import { printJson } from "../../../command-utils/print-json";
import type {
  TraceSessionOutcome,
  TraceSessionResult,
} from "./trace-session-result.types";

export interface TracesUploadReport {
  dryRun: boolean;
  results: TraceSessionResult[];
  skipped: SkippedTracePath[];
  unrecognisedFileCount: number;
}

export const logSkippedPaths = (skipped: SkippedTracePath[]): void => {
  for (const { path, reason } of skipped) {
    logNotice(`Skipped ${path}: ${reason}`);
  }
};

/** One line per session as it finishes, for human output. */
export const formatTraceResult = ({
  agent,
  sessionId,
  sourcePaths,
  stepCount,
  subagentCount,
  outcome,
}: TraceSessionResult): string => {
  const steps =
    stepCount === null
      ? ""
      : ` (${stepCount} steps, ${subagentCount ?? 0} subagents)`;
  const files =
    sourcePaths.length > 1
      ? `${sourcePaths[0]} and ${sourcePaths.length - 1} more`
      : (sourcePaths[0] ?? "");
  return `${agent} ${sessionId}${steps} from ${files}: ${describeOutcome(outcome)}`;
};

export const printTracesUploadReport = (
  report: TracesUploadReport,
  json: boolean,
): void => {
  if (json) {
    printJson(report);
    return;
  }
  console.log(summarise(report));
};

const summarise = ({
  dryRun,
  results,
  skipped,
  unrecognisedFileCount,
}: TracesUploadReport): string => {
  const count = (kind: TraceSessionOutcome["kind"]) =>
    results.filter(({ outcome }) => outcome.kind === kind).length;
  const outcomes = dryRun
    ? [`${count("converted")} converted`]
    : [
        `${count("uploaded")} uploaded`,
        `${count("already-uploaded")} already uploaded`,
      ];
  return (
    `${results.length} sessions: ${[...outcomes, `${count("failed")} failed`].join(", ")}; ` +
    `${skipped.length} paths skipped, ${unrecognisedFileCount} other files ignored`
  );
};

const describeOutcome = (outcome: TraceSessionOutcome): string => {
  switch (outcome.kind) {
    case "uploaded":
      return `uploaded (${outcome.agentTraceId})`;
    case "already-uploaded":
      return `already uploaded (${outcome.agentTraceId})`;
    case "converted":
      return outcome.outputDir
        ? `converted, written to ${outcome.outputDir}`
        : "converted";
    case "failed":
      return `failed: ${outcome.reason}`;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
};
