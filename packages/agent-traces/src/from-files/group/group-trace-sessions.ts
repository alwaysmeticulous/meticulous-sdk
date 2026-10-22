import type {
  DetectedTraceFile,
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
  TraceFileFormat,
  TraceSession,
} from "../trace-files.types";
import { groupAtifSessions } from "./atif/group-atif-sessions";
import { groupClaudeCodeSessions } from "./claude-code/group-claude-code-sessions";
import { groupCodexSessions } from "./codex/group-codex-sessions";
import { groupCursorSessions } from "./cursor/group-cursor-sessions";
import { groupOpenCodeSessions } from "./opencode/group-opencode-sessions";
import { groupPiSessions } from "./pi/group-pi-sessions";

type FilesByFormat = {
  [F in TraceFileFormat]: Array<DetectedTraceFileOf<F>>;
};

/**
 * Native transcripts are grouped first, so an ATIF export of a session that
 * was also given in its own format is the copy that gets skipped.
 */
export const groupTraceSessions = async (
  files: DetectedTraceFile[],
  context: GroupContext,
): Promise<GroupedTraceSessions> => {
  const byFormat = splitByFormat(files);
  const groups = [
    await groupClaudeCodeSessions(
      byFormat["claude-code"],
      byFormat["claude-code-subagent-meta"],
      context,
    ),
    await groupCodexSessions(byFormat.codex, context),
    await groupCursorSessions(byFormat.cursor, context),
    groupOpenCodeSessions(byFormat.opencode, context),
    groupPiSessions(byFormat.pi, context),
    groupAtifSessions(byFormat.atif, context),
  ];
  const skipped = groups.flatMap((group) => group.skipped);
  return {
    sessions: withoutDuplicateSessions(
      groups.flatMap((group) => group.sessions),
      skipped,
    ),
    skipped,
  };
};

const splitByFormat = (files: DetectedTraceFile[]): FilesByFormat => {
  const byFormat: FilesByFormat = {
    "claude-code": [],
    "claude-code-subagent-meta": [],
    codex: [],
    pi: [],
    cursor: [],
    opencode: [],
    atif: [],
  };
  for (const file of files) {
    (byFormat[file.format] as DetectedTraceFile[]).push(file);
  }
  return byFormat;
};

const withoutDuplicateSessions = (
  sessions: TraceSession[],
  skipped: SkippedTracePath[],
): TraceSession[] => {
  const seen = new Map<string, TraceSession>();
  return sessions.filter((session) => {
    const key = `${session.agent}/${session.sessionId}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, session);
      return true;
    }
    skipped.push(
      ...session.sourcePaths.map((path) => ({
        path,
        reason: `${key} is also read from ${existing.sourcePaths[0] ?? ""}`,
      })),
    );
    return false;
  });
};
