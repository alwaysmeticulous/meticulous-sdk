import { isValidSessionId } from "../../session-id";
import type {
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
} from "../../trace-files.types";
import { keepLatestPerKey } from "../keep-latest";
import { prepareOpenCodePayload } from "./prepare-opencode-payload";

export type OpenCodeFile = DetectedTraceFileOf<"opencode">;

/**
 * `opencode export` writes one session per file, so a subagent's export is
 * nested under the export of the session that spawned it (at any depth).
 * A subagent whose parent's export wasn't given is uploaded on its own.
 */
export const groupOpenCodeSessions = (
  files: OpenCodeFile[],
  { converterVersion }: GroupContext,
): GroupedTraceSessions => {
  const skipped: SkippedTracePath[] = [];
  const identified = files.filter((file) => {
    if (isValidSessionId(file.id)) {
      return true;
    }
    skipped.push({ path: file.path, reason: "has no valid session id" });
    return false;
  });
  const byId = new Map(
    keepLatestPerKey(
      identified,
      (file) => file.id ?? "",
      (file) => file,
      skipped,
    ).map((file) => [file.id ?? "", file]),
  );
  const trees = new Map<string, OpenCodeFile[]>();
  for (const file of byId.values()) {
    const rootId = findRootId(file, byId);
    const tree = trees.get(rootId) ?? [];
    // The root goes first.
    if (file.id === rootId) {
      tree.unshift(file);
    } else {
      tree.push(file);
    }
    trees.set(rootId, tree);
  }
  const sessions = [...trees].map(([rootId, tree]) => ({
    agent: "opencode" as const,
    sessionId: rootId,
    sourcePaths: tree.map((file) => file.path),
    prepare: () =>
      prepareOpenCodePayload(
        rootId,
        [...tree].sort((a, b) => depthOf(a, byId) - depthOf(b, byId)),
        converterVersion,
      ),
  }));
  return { sessions, skipped };
};

const findRootId = (
  file: OpenCodeFile,
  byId: Map<string, OpenCodeFile>,
): string => {
  const seen = new Set<string>();
  let current = file;
  for (
    let parent = parentOf(current, byId);
    parent && !seen.has(parent.id ?? "");
    parent = parentOf(current, byId)
  ) {
    seen.add(current.id ?? "");
    current = parent;
  }
  return current.id ?? "";
};

/** Sorting by depth lists descendants breadth first, as the uploader does. */
const depthOf = (
  file: OpenCodeFile,
  byId: Map<string, OpenCodeFile>,
): number => {
  let depth = 0;
  for (
    let parent = parentOf(file, byId);
    parent && depth < byId.size;
    parent = parentOf(parent, byId)
  ) {
    depth++;
  }
  return depth;
};

const parentOf = (
  file: OpenCodeFile,
  byId: Map<string, OpenCodeFile>,
): OpenCodeFile | undefined =>
  file.parentId ? byId.get(file.parentId) : undefined;
