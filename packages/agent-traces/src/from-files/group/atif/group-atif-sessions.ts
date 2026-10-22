import { readFile } from "fs/promises";
import { basename } from "path";
import { statsFromAtif } from "../../../atif/stats-from-atif";
import { validateAtifTrajectory } from "../../../atif/validate-atif-trajectory";
import type { AgentTraceAgent } from "../../../types/constants";
import type { SessionPayload } from "../../../upload/session-payload.types";
import { fileStem, resolveSessionId } from "../../session-id";
import type {
  DetectedTraceFileOf,
  GroupContext,
  GroupedTraceSessions,
  SkippedTracePath,
} from "../../trace-files.types";
import { keepLatestPerKey } from "../keep-latest";
import { resolveAtifAgent } from "./resolve-atif-agent";

type AtifFile = DetectedTraceFileOf<"atif">;

/**
 * Each ATIF file is one session, uploaded as is: the agent it names if we
 * know it, else `other`.
 */
export const groupAtifSessions = (
  files: AtifFile[],
  { agentOverride }: GroupContext,
): GroupedTraceSessions => {
  const skipped: SkippedTracePath[] = [];
  const identified = files.flatMap((file) => {
    const sessionId = resolveSessionId([file.sessionId, fileStem(file.path)]);
    if (!sessionId) {
      skipped.push({ path: file.path, reason: "has no usable session id" });
      return [];
    }
    const agent =
      agentOverride === "other" ? "other" : resolveAtifAgent(file.agentName);
    return [{ agent, sessionId, file }];
  });
  const sessions = keepLatestPerKey(
    identified,
    ({ agent, sessionId }) => `${agent}/${sessionId}`,
    ({ file }) => file,
    skipped,
  ).map(({ agent, sessionId, file }) => ({
    agent,
    sessionId,
    sourcePaths: [file.path],
    prepare: () => prepareAtifPayload(agent, sessionId, file),
  }));
  return { sessions, skipped };
};

const prepareAtifPayload = async (
  agent: AgentTraceAgent,
  sessionId: string,
  file: AtifFile,
): Promise<SessionPayload> => {
  const content = await readFile(file.path, "utf8");
  const { trajectory, error } = validateAtifTrajectory(JSON.parse(content));
  if (!trajectory) {
    throw new Error(`${file.path} isn't a valid ATIF trajectory: ${error}`);
  }
  return {
    envelope: {
      envelopeVersion: 1,
      agent,
      sessionId,
      projectDirName: null,
      rawFormat: "atif",
      files: [
        {
          relativePath: basename(file.path),
          mtimeMs: file.mtimeMs,
          sizeBytes: Buffer.byteLength(content),
          content,
        },
      ],
    },
    trajectory,
    stats: statsFromAtif(trajectory),
  };
};
