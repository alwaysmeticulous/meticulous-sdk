import type {
  CompactRange,
  TestRunCoverageFile,
} from "@alwaysmeticulous/client";
import { shouldDefaultToExecutedRanges } from "@alwaysmeticulous/client";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";

// The per-file range/percentage columns, emitted (after `repoFilePath`) in this
// fixed order. `executableRanges`/`uncoveredRanges`/`coveragePercentage` rely on
// executable-line data we only have for whole test runs.
export type CoverageColumn =
  | "executedRanges"
  | "executableRanges"
  | "uncoveredRanges"
  | "coveragePercentage";

// Single source of truth mapping each column to the request flag that asks for
// it, so the printed columns and the request payload can't drift apart.
export const COVERAGE_COLUMN_FLAG: Record<
  CoverageColumn,
  | "includeExecutedRanges"
  | "includeExecutableRanges"
  | "includeUncoveredRanges"
  | "includeCoveragePercentage"
> = {
  executedRanges: "includeExecutedRanges",
  executableRanges: "includeExecutableRanges",
  uncoveredRanges: "includeUncoveredRanges",
  coveragePercentage: "includeCoveragePercentage",
};

// The four column-selection flags exposed by js-coverage.
export interface CoverageColumnSelection {
  includeExecutedRanges: boolean;
  includeExecutableRanges: boolean;
  includeUncoveredRanges: boolean;
  includeCoveragePercentage: boolean;
}

// The columns (after `repoFilePath`) to request and print, in fixed order.
// Defaults to executed ranges when no column flag is given, so a bare
// invocation matches the historical output.
export const determineColumns = (
  selection: CoverageColumnSelection,
): CoverageColumn[] => {
  const includeExecuted = shouldDefaultToExecutedRanges(selection);
  const columns: CoverageColumn[] = [];
  if (includeExecuted) {
    columns.push("executedRanges");
  }
  if (selection.includeExecutableRanges) {
    columns.push("executableRanges");
  }
  if (selection.includeUncoveredRanges) {
    columns.push("uncoveredRanges");
  }
  if (selection.includeCoveragePercentage) {
    columns.push("coveragePercentage");
  }
  return columns;
};

// The JSON equivalent of a TSV row: `repoFilePath` plus the requested columns,
// with structured values (raw ranges / numeric percentage) rather than the
// TSV-formatted strings.
export const coverageFileToJson = (
  file: TestRunCoverageFile,
  columns: CoverageColumn[],
): Record<string, unknown> => {
  const row: Record<string, unknown> = { repoFilePath: file.repoFilePath };
  for (const column of columns) {
    row[column] = coverageColumnValue(file, column);
  }
  return row;
};

export const coverageColumnValue = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): CompactRange[] | number | null => {
  switch (column) {
    case "executedRanges":
      return file.executedRanges ?? [];
    case "executableRanges":
      return file.executableRanges ?? [];
    case "uncoveredRanges":
      return file.uncoveredRanges ?? [];
    case "coveragePercentage":
      return file.coveragePercentage ?? null;
    default:
      return assertNever(column);
  }
};

// The TSV rendering of a column: the same structured value as the JSON output,
// formatted as a string (ranges joined, percentage to 1dp, absent percentage as
// "n/a"). Delegating to `coverageColumnValue` keeps a single switch over the
// column union.
export const formatCoverageColumn = (
  file: TestRunCoverageFile,
  column: CoverageColumn,
): string => {
  const value = coverageColumnValue(file, column);
  if (typeof value === "number") {
    return value.toFixed(1);
  }
  if (value == null) {
    return "n/a";
  }
  return formatCoverageRanges(value);
};

// Exhaustiveness guard for the CoverageColumn switch in `coverageColumnValue`.
// Local to this package since the public CLI can't depend on the internal
// common-utils helper.
const assertNever = (value: never): never => {
  throw new Error(`Unhandled coverage column: ${String(value)}`);
};
