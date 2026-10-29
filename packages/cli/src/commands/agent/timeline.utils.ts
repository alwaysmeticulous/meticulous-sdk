import type {
  TimelineDiffEntry,
  TimelineDisplayKind,
  TimelineRow,
} from "@alwaysmeticulous/client";
import {
  MAX_TIMELINE_LIMIT,
  TIMELINE_DISPLAY_KINDS,
} from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";
import { pagingOptions } from "./paging-options.utils";

export interface TimelineFilterFlags {
  kinds?: string | undefined;
  sinceMs?: number | undefined;
  untilMs?: number | undefined;
  screenshotName?: string | undefined;
}

export interface TimelinePagingFlags {
  limit?: number | undefined;
  offset?: number | undefined;
}

export const TIMELINE_FILTER_OPTIONS = {
  kinds: {
    string: true,
    description: `Output only events of the given comma-separated kinds (${TIMELINE_DISPLAY_KINDS.join(", ")}), or 'all' for every event. Default: all except asset, subframe, log, storage, limit and container.`,
  },
  sinceMs: {
    number: true,
    description: "Output only events at or after this replay time (ms).",
  },
  untilMs: {
    number: true,
    description: "Output only events at or before this replay time (ms).",
  },
  screenshotName: {
    string: true,
    description:
      "Output only events between the previous screenshot and this screenshot (e.g. after-event-12, end-state).",
  },
} as const;

export const TIMELINE_PAGING_OPTIONS = pagingOptions(
  "rows",
  MAX_TIMELINE_LIMIT,
);

export const parseKinds = (
  kinds: string | undefined,
): TimelineDisplayKind[] | "all" | undefined => {
  if (kinds == null || kinds.trim() === "") {
    return undefined;
  }
  const parsed = kinds.split(",").map((kind) => kind.trim());
  if (parsed.includes("all")) {
    if (parsed.length > 1) {
      throw new CliUserError(
        "Event kind 'all' can't be combined with other kinds.",
      );
    }
    return "all";
  }
  const invalid = parsed.filter(
    (kind) => !(TIMELINE_DISPLAY_KINDS as readonly string[]).includes(kind),
  );
  if (invalid.length > 0) {
    throw new CliUserError(
      `Unknown event kind(s): ${invalid.join(", ")}. Valid kinds: ${TIMELINE_DISPLAY_KINDS.join(", ")}, or all.`,
    );
  }
  return parsed as TimelineDisplayKind[];
};

interface Column<Row> {
  header: string;
  value: (row: Row) => string;
}

export const TIMELINE_COLUMNS: Column<TimelineRow>[] = [
  { header: "eventId", value: (row) => row.eventId },
  { header: "timeMs", value: (row) => String(row.timeMs) },
  { header: "kind", value: (row) => row.kind },
  { header: "description", value: (row) => row.description ?? "" },
  { header: "count", value: (row) => formatCount(row) },
];

// Plain output only: --json carries the raw status.
export const TIMELINE_DIFF_MARKERS: Record<string, string> = {
  identical: " ",
  removed: "-",
  added: "+",
  changed: "!",
};

export const TIMELINE_DIFF_COLUMNS: Column<TimelineDiffEntry>[] = [
  { header: "diff", value: (row) => TIMELINE_DIFF_MARKERS[row.diff] ?? " " },
  { header: "eventId", value: (row) => row.eventId },
  { header: "timeMs", value: (row) => String(row.timeMs) },
  { header: "kind", value: (row) => row.kind },
  { header: "description", value: (row) => row.description ?? "" },
  { header: "count", value: (row) => formatCount(row) },
  { header: "changes", value: (row) => row.changes?.join("; ") ?? "" },
];

const formatCount = (row: TimelineRow): string =>
  row.count != null ? String(row.count) : "";

/**
 * Replaces tabs and newlines, which would shift the TSV's columns. Not trimmed:
 * the `diff` column's identical marker is a space.
 */
export const toCell = (value: string): string =>
  value.replace(/[\t\r\n]\s*/g, " ");

export const printTable = <Row>(rows: Row[], columns: Column<Row>[]): void => {
  console.log(columns.map((column) => column.header).join("\t"));
  for (const row of rows) {
    console.log(columns.map((column) => toCell(column.value(row))).join("\t"));
  }
};
