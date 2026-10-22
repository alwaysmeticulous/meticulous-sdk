import { readGitBranch } from "../identity/read-git-branch";
import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import type { SessionPayload } from "../upload/session-payload.types";
import { convertPiSession } from "./convert-pi-session";
import { parsePiSession } from "./parse-pi-session";

export interface PiPayloadFiles {
  sessionId: string;
  projectDirName: string | null;
  file: AgentTraceRawFile;
}

export const buildPiPayload = (
  { sessionId, projectDirName, file }: PiPayloadFiles,
  converterVersion: string,
): SessionPayload => {
  const parsed = parsePiSession(file.content);
  const { trajectory, stats } = convertPiSession(
    {
      sessionId,
      parsed,
      // Pi doesn't record the branch, so this is the one checked out at upload time.
      gitBranch: readGitBranch(parsed.header?.cwd ?? null),
    },
    converterVersion,
  );
  return {
    envelope: {
      envelopeVersion: 1,
      agent: "pi",
      sessionId,
      projectDirName,
      files: [file],
    },
    trajectory,
    stats,
  };
};
