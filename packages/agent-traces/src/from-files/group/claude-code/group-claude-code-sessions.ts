import { basename, dirname, join } from "path";
import { buildClaudeCodePayload } from "../../../claude-code/build-claude-code-payload";
import { assertNever } from "../../../utils/assert-never";
import { claudeCodeSubagentMetaName } from "../../detect/claude-code-file-names";
import { readTraceFile } from "../../collect/read-trace-file";
import type {
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
  TraceSession,
} from "../../trace-files.types";
import { keepLatestPerKey } from "../keep-latest";
import type { ClaudeCodeFile } from "./classify-claude-code-file";
import { classifyClaudeCodeFile } from "./classify-claude-code-file";
import type { ClaudeCodeSubagentFiles } from "./find-claude-code-subagents";
import {
  findClaudeCodeSubagentsOnDisk,
  findSubagentMeta,
} from "./find-claude-code-subagents";

interface MainTranscript {
  sessionId: string;
  file: ClaudeCodeFile;
}

interface LooseSubagent {
  parentSessionId: string | null;
  agentId: string;
  file: ClaudeCodeFile;
}

/**
 * One session per main transcript, with its subagents: those on disk beside
 * it, and any subagent transcripts given that name it as their session.
 */
export const groupClaudeCodeSessions = async (
  files: ClaudeCodeFile[],
  metaFiles: DetectedTraceFileOf<"claude-code-subagent-meta">[],
  { converterVersion }: GroupContext,
): Promise<GroupedTraceSessions> => {
  const skipped: SkippedTracePath[] = [];
  const { mains, looseSubagents } = classifyFiles(files, skipped);
  const subagentsBySession = new Map<string, ClaudeCodeSubagentFiles[]>();
  for (const main of mains) {
    subagentsBySession.set(
      main.sessionId,
      await findClaudeCodeSubagentsOnDisk(main.file.path),
    );
  }
  for (const loose of looseSubagents) {
    await attachLooseSubagent(loose, subagentsBySession, skipped);
  }
  const usedPaths = new Set(
    [...subagentsBySession.values()]
      .flat()
      .flatMap(({ jsonl, meta }) => (meta ? [jsonl, meta] : [jsonl]))
      .map((file) => file.realPath),
  );
  for (const meta of metaFiles) {
    if (meta.explicit && !usedPaths.has(meta.realPath)) {
      skipped.push({
        path: meta.path,
        reason: "describes a subagent whose transcript wasn't found",
      });
    }
  }
  const sessions = mains.map((main) =>
    toSession(
      main,
      subagentsBySession.get(main.sessionId) ?? [],
      converterVersion,
    ),
  );
  return { sessions, skipped };
};

const classifyFiles = (
  files: ClaudeCodeFile[],
  skipped: SkippedTracePath[],
) => {
  const mains: MainTranscript[] = [];
  const looseSubagents: LooseSubagent[] = [];
  for (const file of files) {
    const role = classifyClaudeCodeFile(file);
    switch (role.kind) {
      case "main":
        mains.push({ sessionId: role.sessionId, file });
        break;
      case "subagent":
        looseSubagents.push({ ...role, file });
        break;
      case "unidentified":
        skipped.push({ path: file.path, reason: "has no session id" });
        break;
      default:
        assertNever(role);
    }
  }
  return {
    mains: keepLatestPerKey(
      mains,
      ({ sessionId }) => sessionId,
      ({ file }) => file,
      skipped,
    ),
    looseSubagents,
  };
};

const attachLooseSubagent = async (
  { parentSessionId, agentId, file }: LooseSubagent,
  subagentsBySession: Map<string, ClaudeCodeSubagentFiles[]>,
  skipped: SkippedTracePath[],
): Promise<void> => {
  const siblings = parentSessionId
    ? subagentsBySession.get(parentSessionId)
    : undefined;
  if (!siblings) {
    skipped.push({
      path: file.path,
      reason: `subagent of session ${parentSessionId ?? "(unknown)"}, whose main transcript wasn't given`,
    });
    return;
  }
  if (siblings.some((subagent) => subagent.agentId === agentId)) {
    return;
  }
  siblings.push({
    agentId,
    jsonl: file,
    meta: await findSubagentMeta(file.path, agentId),
  });
};

const toSession = (
  { sessionId, file }: MainTranscript,
  subagents: ClaudeCodeSubagentFiles[],
  converterVersion: string,
): TraceSession => ({
  agent: "claude-code",
  sessionId,
  sourcePaths: [
    file.path,
    ...subagents.flatMap(({ jsonl, meta }) =>
      meta ? [jsonl.path, meta.path] : [jsonl.path],
    ),
  ],
  prepare: async () => {
    const subagentDir = join(sessionId, "subagents");
    return buildClaudeCodePayload(
      {
        sessionId,
        projectDirName: basename(dirname(file.path)),
        main: await readTraceFile(file, basename(file.path)),
        subagents: await Promise.all(
          subagents.map(async ({ agentId, jsonl, meta }) => ({
            agentId,
            jsonl: await readTraceFile(
              jsonl,
              join(subagentDir, `agent-${agentId}.jsonl`),
            ),
            meta: meta
              ? await readTraceFile(
                  meta,
                  join(subagentDir, claudeCodeSubagentMetaName(agentId)),
                )
              : null,
          })),
        ),
      },
      converterVersion,
    );
  },
});
