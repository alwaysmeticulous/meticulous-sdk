import { readdir } from "fs/promises";
import { basename, dirname, join, relative } from "path";
import { statTraceFile } from "../../collect/stat-trace-file";
import { fileStem, isValidSessionId } from "../../session-id";
import type { TraceFile } from "../../trace-files.types";

const TRANSCRIPTS_DIR_NAME = "agent-transcripts";
/** Cursor writes JSONL today; older installs wrote plain text. */
const TRANSCRIPT_EXTENSIONS = [".jsonl", ".txt"] as const;

export interface CursorSubagentFile {
  subagentId: string;
  file: TraceFile;
}

/** `<id>/<id>.jsonl` rather than a legacy flat `agent-transcripts/<id>.jsonl`. */
export const isNestedTranscript = (path: string): boolean =>
  basename(dirname(path)) === fileStem(path);

/** For `<parentId>/subagents/<id>.jsonl`, the parent's id. */
export const subagentParentIdOf = (path: string): string | null =>
  basename(dirname(path)) === "subagents"
    ? basename(dirname(dirname(path)))
    : null;

/** `<projects>/<project>/agent-transcripts/[<id>/]<id>.jsonl` */
export const cursorProjectDirOf = (rootPath: string): string | null => {
  const transcriptsDir = isNestedTranscript(rootPath)
    ? dirname(dirname(rootPath))
    : dirname(rootPath);
  return basename(transcriptsDir) === TRANSCRIPTS_DIR_NAME
    ? dirname(transcriptsDir)
    : null;
};

/**
 * Relative to Cursor's `projects` directory as the uploader writes them, or
 * `transcript/…` for transcripts kept somewhere else.
 */
export const cursorRelativePath = (
  projectDir: string | null,
  rootPath: string,
  path: string,
): string => {
  const fromBase = relative(
    projectDir ? dirname(projectDir) : dirname(rootPath),
    path,
  );
  if (fromBase.startsWith("..")) {
    return join("transcript", "subagents", basename(path));
  }
  return projectDir ? fromBase : join("transcript", fromBase);
};

/** `<id>/subagents/<childId>.{jsonl,txt}` beside a nested transcript, JSONL first. */
export const findCursorSubagentsOnDisk = async (
  rootPath: string,
): Promise<CursorSubagentFile[]> => {
  if (!isNestedTranscript(rootPath)) {
    return [];
  }
  const dir = join(dirname(rootPath), "subagents");
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch {
    return [];
  }
  const found = new Map<string, TraceFile>();
  for (const extension of TRANSCRIPT_EXTENSIONS) {
    for (const name of names.filter((n) => n.endsWith(extension))) {
      const subagentId = name.slice(0, -extension.length);
      if (found.has(subagentId) || !isValidSessionId(subagentId)) {
        continue;
      }
      const file = await statTraceFile(join(dir, name));
      if (file) {
        found.set(subagentId, file);
      }
    }
  }
  return [...found].map(([subagentId, file]) => ({ subagentId, file }));
};
