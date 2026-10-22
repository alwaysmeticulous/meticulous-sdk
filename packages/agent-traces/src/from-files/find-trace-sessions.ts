import { collectTraceFiles } from "./collect/collect-trace-files";
import { detectTraceFile } from "./detect/detect-trace-file";
import { groupTraceSessions } from "./group/group-trace-sessions";
import type {
  DetectedTraceFile,
  FileTraceAgent,
  SkippedTracePath,
  TraceSession,
} from "./trace-files.types";

export interface FindTraceSessionsOptions {
  /** Treats every file as this agent's format instead of detecting it. */
  agentOverride?: FileTraceAgent | null;
  /** Recorded in each trajectory's `notes`. */
  converterVersion: string;
  /** Hears about files found by crawling that aren't traces. */
  onUnrecognisedFile?: (path: string) => void;
}

export interface FoundTraceSessions {
  sessions: TraceSession[];
  /** Files given that aren't traces, and traces that couldn't be grouped. */
  skipped: SkippedTracePath[];
  /** Files found by crawling directories that aren't traces. */
  unrecognisedCount: number;
}

/**
 * Finds the agent sessions in trace files a user already has: each path is
 * a file or a directory to crawl. Files are only read far enough to group
 * them; each session's `prepare` reads and converts it.
 */
export const findTraceSessions = async (
  paths: string[],
  {
    agentOverride = null,
    converterVersion,
    onUnrecognisedFile,
  }: FindTraceSessionsOptions,
): Promise<FoundTraceSessions> => {
  const { files, skipped } = await collectTraceFiles(paths);
  const detected: DetectedTraceFile[] = [];
  let unrecognisedCount = 0;
  for (const file of files) {
    let result: DetectedTraceFile | null;
    try {
      result = await detectTraceFile(file, agentOverride);
    } catch (error) {
      skipped.push({ path: file.path, reason: `unreadable: ${String(error)}` });
      continue;
    }
    if (result) {
      detected.push(result);
    } else if (file.explicit) {
      skipped.push({
        path: file.path,
        reason: "not a recognised trace format",
      });
    } else {
      unrecognisedCount++;
      onUnrecognisedFile?.(file.path);
    }
  }
  const grouped = await groupTraceSessions(detected, {
    converterVersion,
    agentOverride,
  });
  return {
    sessions: grouped.sessions,
    skipped: [...skipped, ...grouped.skipped],
    unrecognisedCount,
  };
};
