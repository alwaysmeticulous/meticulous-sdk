import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { PositionedTimelineEntry, TimelineEntry } from "./debug.types";
import {
  discoverReplayDirs,
  inVirtualTimeOrder,
  readReplayTimeline,
  type ReplayDir,
} from "./replay-walk";

const NETWORK_KINDS = new Set([
  "pollyReplay",
  "passedThroughNetworkRequest",
  "assetLoadNetworkRequest",
  "customResponseOverrideNetworkRequest",
]);

const MAX_LOG_MSG_LENGTH = 200;
const EVENTS_BEFORE_SCREENSHOT = 30;
const EVENTS_AFTER_SCREENSHOT = 10;

export const generateDebugDerivedFiles = (workspaceDir: string): void => {
  const debugDataDir = join(workspaceDir, DEBUG_DATA_DIRECTORY);
  const replaysDir = join(debugDataDir, "replays");

  if (!existsSync(replaysDir)) {
    return;
  }

  const replayDirs = discoverReplayDirs(replaysDir, {
    requireTimeline: true,
  });
  if (replayDirs.length === 0) {
    return;
  }

  console.log(chalk.cyan("  Generating debug derived files..."));

  for (const replayDir of replayDirs) {
    const timelineEntries = readReplayTimeline(replayDir.path);

    if (timelineEntries) {
      generateTimelineNdjson(replayDir, timelineEntries);
      // In virtual time order, so a replay stored in that order and one stored
      // in the order its entries were reported line up, but numbered by
      // position in the file, like stored indices and `timeline.ndjson`.
      const entries = inVirtualTimeOrder(timelineEntries);
      generateEventsIndex(debugDataDir, replayDir, entries);
      generateNetworkLog(debugDataDir, replayDir, entries);
      generateScreenshotTimelineContext(debugDataDir, replayDir, entries);
    }

    generateVtProgression(debugDataDir, replayDir);
    generateLogsIndex(debugDataDir, replayDir);
  }
};

// Replays from before 3 April 2026 only ship the legacy `timeline.json`;
// derive the ndjson form for them so the greppable layout is the same for
// every replay in the workspace.
const generateTimelineNdjson = (
  replayDir: ReplayDir,
  entries: TimelineEntry[],
): void => {
  const ndjsonPath = join(replayDir.path, "timeline.ndjson");
  if (existsSync(ndjsonPath)) {
    return;
  }
  const lines = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  writeFileSync(ndjsonPath, lines, "utf-8");
};

const generateEventsIndex = (
  debugDataDir: string,
  replayDir: ReplayDir,
  entries: PositionedTimelineEntry[],
): void => {
  const lines = entries.map(({ entry, fileIndex }) =>
    formatTimelineEntry(entry, fileIndex),
  );

  const outDir = join(debugDataDir, "events-index");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${replayDir.role}-${replayDir.replayId}.txt`),
    lines.join("\n") + "\n",
    "utf-8",
  );
};

const generateNetworkLog = (
  debugDataDir: string,
  replayDir: ReplayDir,
  entries: PositionedTimelineEntry[],
): void => {
  const lines = entries
    .filter(({ entry }) => NETWORK_KINDS.has(entry.kind))
    .map(({ entry, fileIndex }) => formatNetworkEntry(entry, fileIndex));

  if (lines.length === 0) {
    return;
  }

  const outDir = join(debugDataDir, "network-log");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${replayDir.role}-${replayDir.replayId}.txt`),
    lines.join("\n") + "\n",
    "utf-8",
  );
};

const generateVtProgression = (
  debugDataDir: string,
  replayDir: ReplayDir,
): void => {
  const logsPath = join(replayDir.path, "logs.ndjson");
  if (!existsSync(logsPath)) {
    return;
  }

  const content = readFileSync(logsPath, "utf-8");
  const vtValues: number[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (entry.type === "virtual-time-change" && entry.virtualTime != null) {
        vtValues.push(entry.virtualTime);
      }
    } catch {
      // skip malformed lines
    }
  }

  if (vtValues.length === 0) {
    return;
  }

  const outDir = join(debugDataDir, "vt-progression");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${replayDir.role}-${replayDir.replayId}.txt`),
    vtValues.join("\n") + "\n",
    "utf-8",
  );
};

const generateLogsIndex = (
  debugDataDir: string,
  replayDir: ReplayDir,
): void => {
  const logsPath = join(replayDir.path, "logs.ndjson");
  if (!existsSync(logsPath)) {
    return;
  }

  const content = readFileSync(logsPath, "utf-8");
  const lines: string[] = [];
  let lastVt = 0;
  let lineIndex = 0;

  for (const rawLine of content.split("\n")) {
    if (!rawLine.trim()) {
      continue;
    }

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(rawLine);
    } catch {
      lineIndex++;
      continue;
    }

    if (entry.type === "virtual-time-change" && entry.virtualTime != null) {
      const newVt = Number(entry.virtualTime);
      lines.push(
        `[${lineIndex}] vt=${lastVt} [virtual-time-change -> ${newVt}]`,
      );
      lastVt = newVt;
    } else {
      const source = entry.source ?? "?";
      const type = entry.type ?? "?";
      const msg = truncate(String(entry.message ?? ""), MAX_LOG_MSG_LENGTH);
      lines.push(
        `[${lineIndex}] vt=${lastVt} source=${source} type=${type} msg=${msg}`,
      );
    }

    lineIndex++;
  }

  if (lines.length === 0) {
    return;
  }

  const outDir = join(debugDataDir, "logs-index");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${replayDir.role}-${replayDir.replayId}.txt`),
    lines.join("\n") + "\n",
    "utf-8",
  );
};

const generateScreenshotTimelineContext = (
  debugDataDir: string,
  replayDir: ReplayDir,
  entries: PositionedTimelineEntry[],
): void => {
  const screenshotPositions = entries.flatMap(({ entry }, position) =>
    entry.kind === "screenshot" ? [position] : [],
  );

  if (screenshotPositions.length === 0) {
    return;
  }

  const outDir = join(debugDataDir, "screenshot-timeline-context");
  mkdirSync(outDir, { recursive: true });

  for (const screenshotPosition of screenshotPositions) {
    const { entry: screenshotEntry, fileIndex: screenshotFileIndex } =
      entries[screenshotPosition];
    const identifier = getScreenshotIdentifierString(screenshotEntry);

    const surrounding = entries.slice(
      Math.max(0, screenshotPosition - EVENTS_BEFORE_SCREENSHOT),
      screenshotPosition + EVENTS_AFTER_SCREENSHOT + 1,
    );

    const lines: string[] = [];
    lines.push(
      `Screenshot: ${identifier} (timeline.ndjson index ${screenshotFileIndex}, vt=${formatVt(screenshotEntry)})`,
    );
    lines.push(
      `Showing the ${EVENTS_BEFORE_SCREENSHOT} events before and ${EVENTS_AFTER_SCREENSHOT} after it in virtual time order; [n] is each event's index in timeline.ndjson`,
    );
    lines.push("");

    for (const { entry, fileIndex } of surrounding) {
      const prefix = fileIndex === screenshotFileIndex ? ">>>" : "   ";
      lines.push(`${prefix} ${formatTimelineEntry(entry, fileIndex)}`);
    }

    const filename = identifier
      ? `${replayDir.role}-${replayDir.replayId}-${identifier}.txt`
      : `${replayDir.role}-${replayDir.replayId}-idx${screenshotFileIndex}.txt`;

    writeFileSync(join(outDir, filename), lines.join("\n") + "\n", "utf-8");
  }
};

const formatVt = (entry: TimelineEntry): string => {
  const vts = entry.virtualTimeStart;
  const vte = entry.virtualTimeEnd;
  if (vts == null && vte == null) {
    return "?";
  }
  if (vts === vte || vte == null) {
    return `${vts}`;
  }
  if (vts == null) {
    return `?-${vte}`;
  }
  return `${vts}-${vte}`;
};

const truncate = (s: string, maxLen: number): string =>
  s.length > maxLen ? s.slice(0, maxLen) + "..." : s;

const formatTimelineEntry = (
  entry: TimelineEntry,
  fileIndex: number,
): string => {
  const vt = formatVt(entry);
  const base = `[${fileIndex}] vt=${vt} kind=${entry.kind}`;
  const detail = getKindSpecificDetail(entry);
  return detail ? `${base} ${detail}` : base;
};

const getKindSpecificDetail = (entry: TimelineEntry): string => {
  const data = entry.data ?? {};

  switch (entry.kind) {
    case "screenshot":
      return `id=${formatScreenshotIdentifier(data.identifier)}`;

    case "pollyReplay": {
      const req = (data.pollyRequest as Record<string, unknown>) ?? {};
      const reqReq = (req.request as Record<string, unknown>) ?? {};
      const method = reqReq.method ?? "?";
      const url = truncate(String(reqReq.url ?? "?"), 120);
      const result = data.result ?? "?";
      const matched = (data.matchedRequest as Record<string, unknown>) ?? {};
      const matchedResp = (matched.response as Record<string, unknown>) ?? {};
      const status = matchedResp.status ?? "";
      const repair = data.repairSource ? ` repair=${data.repairSource}` : "";
      return `${method} ${url} -> ${status} (${result})${repair}`;
    }

    case "passedThroughNetworkRequest": {
      const req = (data.request as Record<string, unknown>) ?? {};
      const method = req.method ?? "?";
      const url = truncate(String(req.url ?? "?"), 120);
      return `${method} ${url} (passed-through)`;
    }

    case "assetLoadNetworkRequest": {
      const req = (data.request as Record<string, unknown>) ?? {};
      const resp = (data.response as Record<string, unknown>) ?? {};
      const method = req.method ?? "?";
      const url = truncate(String(req.url ?? "?"), 120);
      const status = resp.statusCode ?? "?";
      return `${method} ${url} -> ${status} (asset)`;
    }

    case "customResponseOverrideNetworkRequest": {
      const req = (data.request as Record<string, unknown>) ?? {};
      const method = req.method ?? "?";
      const url = truncate(String(req.url ?? "?"), 120);
      return `${method} ${url} (custom-override)`;
    }

    case "consoleMessage": {
      const type = data.type ?? "?";
      const msg = truncate(String(data.message ?? ""), 150);
      return `type=${type} msg=${msg}`;
    }

    case "urlChange":
    case "fullPageNavigation":
      return `url=${truncate(String(data.url ?? "?"), 120)}`;

    case "initialNavigation": {
      const url = truncate(String(data.url ?? "?"), 120);
      const status = data.status ?? "?";
      return `url=${url} -> ${status}`;
    }

    case "jsReplay": {
      const event = data.event ?? "?";
      if (event === "simulate") {
        const userEvent = (data.userEvent as Record<string, unknown>) ?? {};
        const eventType = userEvent.type ?? "?";
        const result = data.result ?? "?";
        return `${eventType} result=${result}`;
      }
      return `event=${event}`;
    }

    case "fatalError":
    case "assertionError":
    case "error": {
      const msg = truncate(String(data.message ?? data.type ?? ""), 150);
      return msg;
    }

    case "timeoutError": {
      const waitedFor = data.waitedFor ?? "?";
      const timeout = data.timeoutInMs ?? "?";
      return `waitedFor=${waitedFor} timeout=${timeout}ms`;
    }

    case "webSocket": {
      const event = data.event ?? "?";
      const url = data.url ? truncate(String(data.url), 80) : "";
      return `${event}${url ? ` url=${url}` : ""}`;
    }

    case "eventSource": {
      const event = data.event ?? "?";
      const url = data.url ? truncate(String(data.url), 80) : "";
      return `${event}${url ? ` url=${url}` : ""}`;
    }

    case "streamingFetch":
    case "streamingXhr": {
      const event = data.event ?? "?";
      const url = data.url ? truncate(String(data.url), 80) : "";
      const method = data.method ?? "";
      return `${event} ${method} ${url}`.trim();
    }

    case "applicationStorageAccess": {
      const storageType = data.storageType ?? "?";
      const key = truncate(String(data.key ?? "?"), 60);
      return `${storageType} key=${key} found=${data.didFindValue}`;
    }

    case "applicationStorageWrite": {
      const storageType = data.storageType ?? "?";
      const key = truncate(String(data.key ?? "?"), 60);
      return `${storageType} key=${key}`;
    }

    case "correctnessWarning":
    case "potentialFlakinessWarning": {
      const type = data.type ?? "?";
      return `type=${type}`;
    }

    case "debugEvent": {
      const type = data.type ?? "?";
      return `type=${type}`;
    }

    case "timelineEntryLimitReached": {
      const entryKind = data.entryKind ?? "?";
      const limit = data.limit ?? "?";
      return `entryKind=${entryKind} limit=${limit}`;
    }

    default:
      return "";
  }
};

const formatNetworkEntry = (
  entry: TimelineEntry,
  fileIndex: number,
): string => {
  const vt = formatVt(entry);
  const base = `[${fileIndex}] vt=${vt}`;
  const detail = getKindSpecificDetail(entry);
  return `${base} ${detail}`;
};

const formatScreenshotIdentifier = (identifier: unknown): string => {
  if (identifier == null) {
    return "?";
  }
  if (typeof identifier === "string") {
    return identifier;
  }
  if (typeof identifier === "object") {
    const id = identifier as Record<string, unknown>;
    if (id.variant && id.variant !== "normal") {
      return `${id.variant}-screenshot-after-event-${String(id.eventNumber ?? "?").padStart(5, "0")}`;
    }
    return `screenshot-after-event-${String(id.eventNumber ?? "?").padStart(5, "0")}`;
  }
  return String(identifier);
};

const getScreenshotIdentifierString = (entry: TimelineEntry): string | null => {
  const id = entry.data?.identifier;
  if (id == null) {
    return null;
  }
  return formatScreenshotIdentifier(id);
};
