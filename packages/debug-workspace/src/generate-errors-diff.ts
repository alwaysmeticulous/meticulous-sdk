import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext, TimelineEntry } from "./debug.types";
import { formatErrorStackFrames } from "./format-stack-frames";
import { listReplayPairs } from "./replay-pairs";
import { inVirtualTimeOrder, readReplayTimeline } from "./replay-walk";

const MAX_GROUPS_PER_SECTION = 100;
const MAX_MESSAGE_LENGTH = 300;
const STACK_FRAMES_SHOWN = 3;

type ErrorCategory = "uncaught" | "console";

interface ErrorOccurrence {
  category: ErrorCategory;
  /** e.g. `unhandled-promise-rejection`, `fatalError`, `console.error`. */
  type: string;
  message: string;
  frames: string[];
  vt: number | undefined;
  fileIndex: number;
}

interface ErrorGroup {
  /** The first occurrence seen, head first, for the message and stack. */
  sample: ErrorOccurrence;
  /** First occurrence in each replay, if it logged this error at all. */
  head: ErrorOccurrence | undefined;
  base: ErrorOccurrence | undefined;
  headCount: number;
  baseCount: number;
}

/**
 * Writes `errors-diff/<head>-vs-<base>.txt` per compared pair: the uncaught
 * errors and `console.error` messages of each replay, grouped by message and
 * marked by which replay logged them. Uncaught errors are only recorded in the
 * timeline, never in the replay logs, so log-based files can't show them.
 */
export const generateErrorsDiff = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  const pairs = listReplayPairs(debugContext, workspaceDir);
  if (pairs.length === 0) {
    return;
  }
  const outDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "errors-diff");
  mkdirSync(outDir, { recursive: true });

  for (const pair of pairs) {
    const groups = groupErrors(
      collectErrors(pair.headDir),
      collectErrors(pair.baseDir),
    );
    writeFileSync(join(outDir, `${pair.label}.txt`), formatErrorsDiff(groups));
  }
  console.log(
    chalk.green(`  Generated ${pairs.length} errors diff(s) in errors-diff/`),
  );
};

const collectErrors = (replayDir: string): ErrorOccurrence[] => {
  const timeline = readReplayTimeline(replayDir);
  if (timeline == null) {
    return [];
  }
  return inVirtualTimeOrder(timeline).flatMap(({ entry, fileIndex }) => {
    const occurrence = toErrorOccurrence(entry);
    return occurrence
      ? [{ ...occurrence, vt: entry.virtualTimeStart, fileIndex }]
      : [];
  });
};

const toErrorOccurrence = (
  entry: TimelineEntry,
): Omit<ErrorOccurrence, "vt" | "fileIndex"> | undefined => {
  const data = entry.data ?? {};
  const message = typeof data.message === "string" ? data.message : "";
  switch (entry.kind) {
    case "error":
      // Puppeteer's `pageerror`, a duplicate of the window listener's
      // `unhandled-window-error` entry for the same crash.
      if (data.type === "unhandled-error") {
        return undefined;
      }
      return {
        category: "uncaught",
        type: typeof data.type === "string" ? data.type : "error",
        message,
        frames: formatErrorStackFrames(data, STACK_FRAMES_SHOWN),
      };
    case "fatalError":
      return {
        category: "uncaught",
        type: "fatalError",
        message,
        frames: formatErrorStackFrames(data, STACK_FRAMES_SHOWN),
      };
    case "consoleMessage":
      return data.type === "error"
        ? { category: "console", type: "console.error", message, frames: [] }
        : undefined;
    default:
      return undefined;
  }
};
const groupErrors = (
  head: ErrorOccurrence[],
  base: ErrorOccurrence[],
): ErrorGroup[] => {
  const groups = new Map<string, ErrorGroup>();
  const add = (occurrence: ErrorOccurrence, side: "head" | "base") => {
    const key = `${occurrence.category}|${occurrence.type}|${normalizeMessage(occurrence.message)}`;
    const group = groups.get(key) ?? {
      sample: occurrence,
      head: undefined,
      base: undefined,
      headCount: 0,
      baseCount: 0,
    };
    if (side === "head") {
      group.head ??= occurrence;
      group.headCount++;
    } else {
      group.base ??= occurrence;
      group.baseCount++;
    }
    groups.set(key, group);
  };
  head.forEach((occurrence) => add(occurrence, "head"));
  base.forEach((occurrence) => add(occurrence, "base"));
  return [...groups.values()].sort(
    (a, b) => groupRank(a) - groupRank(b) || compareVt(a, b),
  );
};

// IDs, hashes and long numbers (timestamps, counters) vary between otherwise
// identical messages. Short numbers are kept: they're often what tells two
// errors apart, e.g. React's `#310` vs `#300` or an HTTP status.
// Within a URL every number counts as an ID, and the query string is dropped,
// so failed loads of e.g. `avatars/28.png` and `avatars/58.png` group together.
const normalizeMessage = (message: string): string =>
  message
    .replace(UUID, "<ID>")
    .replace(/[0-9a-f]{8,}/gi, "<H>")
    .replace(URL_IN_MESSAGE, (url) =>
      url.split(/[?#]/)[0].replace(/\d+/g, "<N>"),
    )
    .replace(/\d{4,}/g, "<N>");

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const URL_IN_MESSAGE = /\bhttps?:\/\/[^\s"'<>()]+/g;

const groupRank = ({ headCount, baseCount }: ErrorGroup): number => {
  if (baseCount === 0) {
    return 0;
  }
  if (headCount === 0) {
    return 1;
  }
  return headCount === baseCount ? 3 : 2;
};

const compareVt = (a: ErrorGroup, b: ErrorGroup): number =>
  (a.sample.vt ?? Infinity) - (b.sample.vt ?? Infinity);

const formatErrorsDiff = (groups: ErrorGroup[]): string => {
  const lines = [
    "Errors in head (new code) vs base (old code), grouped by message (IDs, hashes, numbers of",
    "4+ digits, and numbers and query strings in URLs ignored). Each group: which replay logged",
    "it, how often, and where it first occurs in each replay: virtual time and [n], the index in",
    "that replay's timeline.ndjson.",
    "Frames marked [unmapped] point into the bundled assets. console.error messages have no stack.",
    "",
  ];
  for (const [category, title] of [
    ["uncaught", "Uncaught errors and unhandled promise rejections"],
    ["console", "console.error messages"],
  ] as const) {
    const inCategory = groups.filter((g) => g.sample.category === category);
    lines.push(`== ${title} (${inCategory.length})`);
    if (inCategory.length === 0) {
      lines.push("  none in either replay");
    }
    for (const group of inCategory.slice(0, MAX_GROUPS_PER_SECTION)) {
      lines.push(...formatGroup(group));
    }
    if (inCategory.length > MAX_GROUPS_PER_SECTION) {
      lines.push(
        `  ... ${inCategory.length - MAX_GROUPS_PER_SECTION} more; grep timeline.ndjson for the rest`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
};

const formatGroup = (group: ErrorGroup): string[] => {
  const { sample, head, base, headCount, baseCount } = group;
  const where =
    baseCount === 0
      ? `head-only x${headCount}`
      : headCount === 0
        ? `base-only x${baseCount}`
        : `both (head x${headCount}, base x${baseCount})`;
  const firstAt = [
    ...(head ? [`head vt=${head.vt ?? "?"} [${head.fileIndex}]`] : []),
    ...(base ? [`base vt=${base.vt ?? "?"} [${base.fileIndex}]`] : []),
  ].join(", ");
  const message =
    sample.message.length > MAX_MESSAGE_LENGTH
      ? `${sample.message.slice(0, MAX_MESSAGE_LENGTH)}...`
      : sample.message;
  return [
    `${where} (first: ${firstAt}) ${sample.type}: ${message.replace(/\s+/g, " ")}`,
    ...sample.frames.map((frame) => `    ${frame}`),
  ];
};
