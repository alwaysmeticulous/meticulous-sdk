import type { JsonRecord } from "../utils/json-guards";
import {
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
} from "../utils/json-guards";
import { parsePullRequestLink } from "./parse-pull-request-link";
import { parseAssistantLine, parseUserLine } from "./parse-message-lines";
import type { TranscriptEntry, TranscriptMetadata } from "./transcript.types";

interface ParsedTranscript {
  entries: TranscriptEntry[];
  metadata: TranscriptMetadata;
}

/**
 * Parses a Claude Code JSONL transcript. Unparseable lines are counted and
 * skipped: the last line is often mid-write while a session is live.
 */
export const parseTranscript = (text: string): ParsedTranscript => {
  const entries: TranscriptEntry[] = [];
  const metadata = createEmptyMetadata();
  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim()) {
      continue;
    }
    const line = parseJsonLine(rawLine);
    if (!line) {
      metadata.malformedLineCount++;
      continue;
    }
    updateMetadata(metadata, line);
    const entry = toEntry(line);
    if (entry) {
      entries.push(entry);
    }
  }
  return { entries, metadata };
};

const toEntry = (line: JsonRecord): TranscriptEntry | null => {
  switch (line["type"]) {
    case "assistant":
      return parseAssistantLine(line);
    case "user":
      return parseUserLine(line);
    default:
      return null;
  }
};

const updateMetadata = (metadata: TranscriptMetadata, line: JsonRecord) => {
  metadata.cwd ??= asNonEmptyString(line["cwd"]);
  metadata.slug ??= asNonEmptyString(line["slug"]);
  metadata.entrypoint ??= asNonEmptyString(line["entrypoint"]);
  const gitBranch = asNonEmptyString(line["gitBranch"]);
  metadata.gitBranch = gitBranch ?? metadata.gitBranch;
  addUnique(metadata.gitBranches, gitBranch);
  addUnique(metadata.permissionModes, asNonEmptyString(line["permissionMode"]));
  metadata.version = asNonEmptyString(line["version"]) ?? metadata.version;

  const timestamp = asNonEmptyString(line["timestamp"]);
  if (timestamp && !Number.isNaN(Date.parse(timestamp))) {
    if (!metadata.startedAt || timestamp < metadata.startedAt) {
      metadata.startedAt = timestamp;
    }
    if (!metadata.endedAt || timestamp > metadata.endedAt) {
      metadata.endedAt = timestamp;
    }
  }

  switch (line["type"]) {
    case "ai-title":
      metadata.aiTitle = asNonEmptyString(line["aiTitle"]) ?? metadata.aiTitle;
      break;
    case "custom-title":
      metadata.customTitle =
        asNonEmptyString(line["customTitle"]) ?? metadata.customTitle;
      break;
    case "summary":
      metadata.summaryTitle =
        asNonEmptyString(line["summary"]) ?? metadata.summaryTitle;
      break;
    case "cost-state":
      metadata.reportedCostUsd =
        asNumber(line["totalCostUSD"]) ?? metadata.reportedCostUsd;
      break;
    case "pr-link": {
      // Claude Code re-records the link on every push to the PR.
      const pullRequest = parsePullRequestLink(line);
      if (
        pullRequest &&
        !metadata.pullRequests.some(({ url }) => url === pullRequest.url)
      ) {
        metadata.pullRequests.push(pullRequest);
      }
      break;
    }
  }
};

const addUnique = (values: string[], value: string | null) => {
  if (value !== null && !values.includes(value)) {
    values.push(value);
  }
};

const parseJsonLine = (rawLine: string): JsonRecord | null => {
  try {
    const parsed = asRecord(JSON.parse(rawLine));
    return parsed && asString(parsed["type"]) !== null ? parsed : null;
  } catch {
    return null;
  }
};

const createEmptyMetadata = (): TranscriptMetadata => ({
  cwd: null,
  gitBranch: null,
  gitBranches: [],
  entrypoint: null,
  permissionModes: [],
  pullRequests: [],
  version: null,
  slug: null,
  startedAt: null,
  endedAt: null,
  aiTitle: null,
  customTitle: null,
  summaryTitle: null,
  reportedCostUsd: null,
  malformedLineCount: 0,
});
