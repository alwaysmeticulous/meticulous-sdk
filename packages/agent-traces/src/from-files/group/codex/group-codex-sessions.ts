import { basename } from "path";
import { buildCodexPayload } from "../../../codex/build-codex-payload";
import { readCodexThreadName } from "../../../codex/read-codex-thread-name";
import { parseRolloutFileName } from "../../../codex/rollout-file-name";
import { readTraceFile } from "../../collect/read-trace-file";
import { isValidSessionId } from "../../session-id";
import type {
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
  TraceSession,
} from "../../trace-files.types";
import { findCodexHome, relativeToCodexHome } from "./find-codex-home";

type CodexFile = DetectedTraceFileOf<"codex">;

interface Rollout {
  file: CodexFile;
  rolloutId: string;
  timestamp: string;
}

interface Thread {
  threadId: string;
  /** Oldest first. */
  rollouts: Rollout[];
  parentId: string | null;
}

/**
 * One session per top-level thread, with every thread it spawned (directly
 * or not) as a subagent, as the uploader groups `$CODEX_HOME`.
 */
export const groupCodexSessions = async (
  files: CodexFile[],
  { converterVersion }: GroupContext,
): Promise<GroupedTraceSessions> => {
  const skipped: SkippedTracePath[] = [];
  const threads = groupThreads(files, skipped);
  const members = new Map<string, Thread[]>();
  for (const thread of threads.values()) {
    const rootId = findRootId(thread.threadId, threads);
    members.set(rootId, [...(members.get(rootId) ?? []), thread]);
  }
  const sessions: TraceSession[] = [];
  for (const [rootId, sessionThreads] of members) {
    const root = threads.get(rootId);
    if (!root || !isValidSessionId(rootId)) {
      skipped.push(
        ...sessionThreads.flatMap(({ rollouts }) =>
          rollouts.map(({ file }) => ({
            path: file.path,
            reason: `thread id ${rootId} isn't a valid session id`,
          })),
        ),
      );
      continue;
    }
    const subagents = sessionThreads
      .filter((thread) => thread !== root)
      .sort((a, b) => a.threadId.localeCompare(b.threadId));
    sessions.push(await toSession(rootId, root, subagents, converterVersion));
  }
  return { sessions, skipped };
};

const toSession = async (
  sessionId: string,
  root: Thread,
  subagents: Thread[],
  converterVersion: string,
): Promise<TraceSession> => {
  const codexHome = await findCodexHome(root.rollouts[0]?.file.path ?? null);
  const readThread = async ({ threadId, rollouts }: Thread) => ({
    threadId,
    files: await Promise.all(
      rollouts.map(({ file }) =>
        readTraceFile(file, relativeToCodexHome(codexHome, file.path)),
      ),
    ),
  });
  return {
    agent: "codex",
    sessionId,
    sourcePaths: [root, ...subagents].flatMap(({ rollouts }) =>
      rollouts.map(({ file }) => file.path),
    ),
    prepare: async () =>
      buildCodexPayload(
        {
          sessionId,
          root: await readThread(root),
          subagents: await Promise.all(subagents.map(readThread)),
          threadName: codexHome
            ? await readCodexThreadName(codexHome, sessionId)
            : null,
        },
        converterVersion,
      ),
  };
};

const groupThreads = (
  files: CodexFile[],
  skipped: SkippedTracePath[],
): Map<string, Thread> => {
  const threads = new Map<string, Thread>();
  const seenRolloutIds = new Set<string>();
  for (const file of files) {
    const name = parseRolloutFileName(basename(file.path));
    const threadId = file.meta?.threadId ?? name?.threadId ?? null;
    if (!threadId) {
      skipped.push({ path: file.path, reason: "has no Codex thread id" });
      continue;
    }
    const rolloutId = name?.threadId === threadId ? name.rolloutId : threadId;
    if (seenRolloutIds.has(rolloutId)) {
      skipped.push({
        path: file.path,
        reason: `another file holds rollout ${rolloutId}`,
      });
      continue;
    }
    seenRolloutIds.add(rolloutId);
    const thread = threads.get(threadId) ?? {
      threadId,
      rollouts: [],
      parentId: null,
    };
    thread.rollouts.push({ file, rolloutId, timestamp: name?.timestamp ?? "" });
    threads.set(threadId, thread);
  }
  for (const thread of threads.values()) {
    thread.rollouts.sort(compareRollouts(thread.threadId));
    thread.parentId = parentIdOf(thread);
  }
  return threads;
};

/** A thread's original rollout precedes those created by reverting it. */
const compareRollouts =
  (threadId: string) =>
  (a: Rollout, b: Rollout): number =>
    a.timestamp.localeCompare(b.timestamp) ||
    Number(a.rolloutId !== threadId) - Number(b.rolloutId !== threadId) ||
    a.rolloutId.localeCompare(b.rolloutId);

const parentIdOf = ({ threadId, rollouts }: Thread): string | null => {
  const meta = rollouts[0]?.file.meta;
  return meta?.sessionId && meta.sessionId !== threadId
    ? meta.sessionId
    : (meta?.parentThreadId ?? null);
};

/** Follows parents while they're among the files, so an orphan is its own root. */
const findRootId = (threadId: string, threads: Map<string, Thread>): string => {
  const seen = new Set([threadId]);
  let current = threadId;
  for (;;) {
    const parentId = threads.get(current)?.parentId;
    if (!parentId || !threads.has(parentId) || seen.has(parentId)) {
      return current;
    }
    seen.add(parentId);
    current = parentId;
  }
};
