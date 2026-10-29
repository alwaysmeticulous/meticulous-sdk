import type {
  PathAlignmentRow,
  TimelineEventDetails,
  TimelineEventDiffResponse,
  TimelineEventFieldDiff,
} from "@alwaysmeticulous/client";
import { TIMELINE_DIFF_MARKERS, toCell } from "./timeline.utils";

/**
 * `eventId:\tvalue`, then one line per field, marked like a `timeline-diff`
 * row: `! user.confidence:\t0.864 -> 0.992`.
 */
export const formatTimelineEventDiff = (
  response: TimelineEventDiffResponse,
): string[] => [
  line("eventId", response.eventId),
  ...response.fields.map(formatFieldDiff),
];

const formatFieldDiff = ({
  diff,
  field,
  base,
  head,
}: TimelineEventFieldDiff): string => {
  const value = diff === "added" ? head : base;
  const formatted =
    diff === "changed"
      ? isPathRow(base) && isPathRow(head)
        ? formatPathRowChange(base, head)
        : formatChange(base, head)
      : isPathRow(value)
        ? formatPathRow(value)
        : formatLeaf(value);
  return `${TIMELINE_DIFF_MARKERS[diff]} ${line(field, formatted)}`;
};

/** Numbers get as many digits as it takes for the two sides not to print alike. */
const formatChange = (base: unknown, head: unknown): string => {
  if (typeof base === "number" && typeof head === "number") {
    for (let digits = 3; digits < 6; digits++) {
      if (base.toFixed(digits) !== head.toFixed(digits)) {
        return `${formatNumber(base, digits)} -> ${formatNumber(head, digits)}`;
      }
    }
  }
  return `${formatLeaf(base)} -> ${formatLeaf(head)}`;
};

const formatNumber = (value: number, digits: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(digits);

const formatLeaf = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.every(isScalar)
      ? value.map(formatScalar).join(",")
      : JSON.stringify(value);
  }
  return value !== null && typeof value === "object"
    ? JSON.stringify(value)
    : formatScalar(value);
};

/** `key:\tvalue` lines, keyed by each field's `--json` path (`user.path[0]`). */
export const formatTimelineEvent = (details: TimelineEventDetails): string[] =>
  fieldLines("", details);

const fieldLines = (prefix: string, fields: object): string[] =>
  Object.entries(fields).flatMap(([key, value]) =>
    valueLines(`${prefix}${key}`, value),
  );

const valueLines = (key: string, value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.every(isScalar)
      ? [line(key, value.map(formatScalar).join(","))]
      : value.map((item, index) =>
          line(`${key}[${index}]`, formatPathRow(item as PathAlignmentRow)),
        );
  }
  if (typeof value === "object" && value !== null) {
    return fieldLines(`${key}.`, value);
  }
  return [line(key, formatScalar(value))];
};

const isPathRow = (value: unknown): value is PathAlignmentRow =>
  value != null &&
  typeof value === "object" &&
  "marker" in value &&
  "element" in value;

/** One aligned `user.path` element: `- div#a (score 1/2; matched: div#b)`. */
const formatPathRow = (row: PathAlignmentRow): string =>
  withParts(`${markerPrefix(row.marker)}${row.element}`, [
    ...(row.score != null ? [`score ${row.score}`] : []),
    ...(row.matched != null ? [`matched: ${row.matched}`] : []),
    ...(row.narrowing != null ? [row.narrowing] : []),
  ]);

/** Each differing part as `base -> head`. */
const formatPathRowChange = (
  base: PathAlignmentRow,
  head: PathAlignmentRow,
): string => {
  const part = (
    label: string,
    baseValue: string | undefined,
    headValue: string | undefined,
  ): string[] => {
    if (baseValue === headValue) {
      return baseValue != null ? [`${label}${baseValue}`] : [];
    }
    return [`${label}${baseValue ?? "none"} -> ${headValue ?? "none"}`];
  };
  const sameMarker = base.marker === head.marker;
  return withParts(
    `${sameMarker ? markerPrefix(base.marker) : ""}${
      base.element === head.element
        ? base.element
        : `${base.element} -> ${head.element}`
    }`,
    [
      ...(sameMarker
        ? []
        : [`${MARKER_NAMES[base.marker]} -> ${MARKER_NAMES[head.marker]}`]),
      ...part("score ", base.score, head.score),
      ...(base.matched != null || head.matched != null
        ? part("matched: ", matchedLabel(base), matchedLabel(head))
        : []),
      ...(base.narrowing === head.narrowing
        ? part("", base.narrowing, head.narrowing)
        : part("narrowing: ", base.narrowing, head.narrowing)),
    ],
  );
};

const markerPrefix = (marker: PathAlignmentRow["marker"]): string =>
  marker === " " ? "" : `${marker} `;

const withParts = (summary: string, parts: string[]): string =>
  parts.length > 0 ? `${summary} (${parts.join("; ")})` : summary;

// An unscored paired row comes from a path replay couldn't align.
const matchedLabel = (row: PathAlignmentRow): string => {
  if (row.matched != null) {
    return row.matched;
  }
  if (row.marker === "-") {
    return "none";
  }
  return row.score != null ? "same" : "unknown";
};

const MARKER_NAMES: Record<PathAlignmentRow["marker"], string> = {
  " ": "paired",
  "-": "skipped",
  "+": "extra",
};

const isScalar = (value: unknown): boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const formatScalar = (value: unknown): string =>
  typeof value === "number" && !Number.isInteger(value)
    ? value.toFixed(3)
    : String(value);

const line = (key: string, value: string): string =>
  `${key}:\t${toCell(value)}`;
