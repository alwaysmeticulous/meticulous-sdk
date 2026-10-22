import { basename, dirname } from "path";
import { buildPiPayload } from "../../../pi/build-pi-payload";
import { readTraceFile } from "../../collect/read-trace-file";
import { fileStem, resolveSessionId } from "../../session-id";
import type {
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
} from "../../trace-files.types";
import { keepLatestPerKey } from "../keep-latest";

/** `<ISO timestamp with : and . as ->_<session id>.jsonl` */
const SESSION_FILE_REGEX = /^[^_]+_(.+)\.jsonl$/;
/** `--<cwd with / as ->--` */
const PROJECT_DIR_REGEX = /^--.*--$/;

type PiFile = DetectedTraceFileOf<"pi">;

/** Each Pi session is one file. */
export const groupPiSessions = (
  files: PiFile[],
  { converterVersion }: GroupContext,
): GroupedTraceSessions => {
  const skipped: SkippedTracePath[] = [];
  const identified = files.flatMap((file) => {
    const sessionId = resolveSessionId([
      file.headerId,
      SESSION_FILE_REGEX.exec(basename(file.path))?.[1] ?? null,
      fileStem(file.path),
    ]);
    if (!sessionId) {
      skipped.push({ path: file.path, reason: "has no usable session id" });
      return [];
    }
    return [{ sessionId, file }];
  });
  const sessions = keepLatestPerKey(
    identified,
    ({ sessionId }) => sessionId,
    ({ file }) => file,
    skipped,
  ).map(({ sessionId, file }) => {
    const dirName = basename(dirname(file.path));
    return {
      agent: "pi" as const,
      sessionId,
      sourcePaths: [file.path],
      prepare: async () =>
        buildPiPayload(
          {
            sessionId,
            projectDirName: PROJECT_DIR_REGEX.test(dirName) ? dirName : null,
            file: await readTraceFile(file, basename(file.path)),
          },
          converterVersion,
        ),
    };
  });
  return { sessions, skipped };
};
