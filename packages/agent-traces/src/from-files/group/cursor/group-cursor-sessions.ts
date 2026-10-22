import { basename } from "path";
import { collectCursorMetadata } from "../../../cursor/convert/collect-cursor-metadata";
import { convertCursorSession } from "../../../cursor/convert/convert-cursor-session";
import { parseCursorTranscript } from "../../../cursor/transcript/parse-cursor-transcript";
import { readGitBranch } from "../../../identity/read-git-branch";
import type { SessionPayload } from "../../../upload/session-payload.types";
import { readTraceFile } from "../../collect/read-trace-file";
import { fileStem, isValidSessionId } from "../../session-id";
import type {
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
  TraceFile,
} from "../../trace-files.types";
import { keepLatestPerKey } from "../keep-latest";
import type { CursorSubagentFile } from "./cursor-transcript-layout";
import {
  cursorProjectDirOf,
  cursorRelativePath,
  findCursorSubagentsOnDisk,
  subagentParentIdOf,
} from "./cursor-transcript-layout";

type CursorFile = DetectedTraceFileOf<"cursor">;

interface CursorRoot {
  sessionId: string;
  file: TraceFile;
  subagents: CursorSubagentFile[];
}

/**
 * One session per conversation transcript, with the subagent transcripts in
 * its `subagents/` directory. There are no hook events to merge, so tool
 * outputs, models and timestamps Cursor leaves out of transcripts are absent.
 */
export const groupCursorSessions = async (
  files: CursorFile[],
  { converterVersion }: GroupContext,
): Promise<GroupedTraceSessions> => {
  const skipped: SkippedTracePath[] = [];
  const roots: CursorRoot[] = [];
  const loose: Array<{ parentId: string; subagent: CursorSubagentFile }> = [];
  for (const file of files) {
    const id = fileStem(file.path);
    const parentId = subagentParentIdOf(file.path);
    if (!isValidSessionId(id)) {
      skipped.push({ path: file.path, reason: "its name isn't a session id" });
    } else if (parentId) {
      loose.push({ parentId, subagent: { subagentId: id, file } });
    } else {
      roots.push({ sessionId: id, file, subagents: [] });
    }
  }
  const kept = keepLatestPerKey(
    roots,
    ({ sessionId }) => sessionId,
    ({ file }) => file,
    skipped,
  );
  for (const root of kept) {
    root.subagents = await findCursorSubagentsOnDisk(root.file.path);
  }
  for (const { parentId, subagent } of loose) {
    const root = kept.find(({ sessionId }) => sessionId === parentId);
    if (!root) {
      skipped.push({
        path: subagent.file.path,
        reason: `subagent of conversation ${parentId}, whose transcript wasn't given`,
      });
    } else if (
      !root.subagents.some((s) => s.subagentId === subagent.subagentId)
    ) {
      root.subagents.push(subagent);
    }
  }
  const sessions = kept.map((root) => ({
    agent: "cursor" as const,
    sessionId: root.sessionId,
    sourcePaths: [root.file, ...root.subagents.map((s) => s.file)].map(
      (file) => file.path,
    ),
    prepare: () => prepareCursorPayload(root, converterVersion),
  }));
  return { sessions, skipped };
};

const prepareCursorPayload = async (
  { sessionId, file, subagents }: CursorRoot,
  converterVersion: string,
): Promise<SessionPayload> => {
  const projectDir = cursorProjectDirOf(file.path);
  const projectDirName = projectDir ? basename(projectDir) : null;
  const read = (traceFile: TraceFile) =>
    readTraceFile(
      traceFile,
      cursorRelativePath(projectDir, file.path, traceFile.path),
    );
  const rootFile = await read(file);
  const subagentFiles = await Promise.all(
    subagents.map(async (subagent) => ({
      subagentId: subagent.subagentId,
      raw: await read(subagent.file),
    })),
  );
  const transcript = parseCursorTranscript(rootFile);
  const metadata = collectCursorMetadata({
    events: [],
    transcript,
    transcriptMtimeMs: file.mtimeMs,
    projectDirName,
  });
  const { trajectory, stats } = convertCursorSession(
    {
      sessionId,
      transcript,
      events: [],
      subagents: subagentFiles.map(({ subagentId, raw }) => ({
        subagentId,
        transcript: parseCursorTranscript(raw),
        events: [],
      })),
      metadata,
      gitBranch: readGitBranch(metadata.cwd),
      malformedEventCount: 0,
    },
    converterVersion,
  );
  return {
    envelope: {
      envelopeVersion: 1,
      agent: "cursor",
      sessionId,
      projectDirName,
      files: [rootFile, ...subagentFiles.map(({ raw }) => raw)],
    },
    trajectory,
    stats,
  };
};
