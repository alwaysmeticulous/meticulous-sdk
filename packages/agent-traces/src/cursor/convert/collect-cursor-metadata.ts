import type { TimedSpooledEvent } from "../../hook-events/spooled-event.types";
import { asArray, asNonEmptyString } from "../../utils/json-guards";
import type { ParsedCursorTranscript } from "../transcript/cursor-transcript.types";
import { decodeProjectDirName } from "./decode-project-dir-name";

export interface CursorSessionMetadata {
  cwd: string | null;
  /** `cursor_version`, from the IDE or the CLI. */
  agentVersion: string | null;
  /** e.g. `agent`, `ask`, `plan`. */
  composerModes: string[];
  startedAt: string | null;
  endedAt: string | null;
  isBackgroundAgent: boolean;
}

interface MetadataSources {
  events: TimedSpooledEvent[];
  transcript: ParsedCursorTranscript | null;
  transcriptMtimeMs: number | null;
  projectDirName: string | null;
}

export const collectCursorMetadata = ({
  events,
  transcript,
  transcriptMtimeMs,
  projectDirName,
}: MetadataSources): CursorSessionMetadata => {
  const metadata: CursorSessionMetadata = {
    cwd: null,
    agentVersion: null,
    composerModes: [],
    startedAt: null,
    endedAt: null,
    isBackgroundAgent: false,
  };
  for (const { event } of events) {
    const payload = event?.payload;
    if (!payload) {
      continue;
    }
    const workspaceRoot = asNonEmptyString(
      asArray(payload["workspace_roots"])?.[0],
    );
    metadata.cwd ??= event.projectDir ?? workspaceRoot;
    metadata.agentVersion =
      asNonEmptyString(payload["cursor_version"]) ?? metadata.agentVersion;
    const mode = asNonEmptyString(payload["composer_mode"]);
    if (mode && !metadata.composerModes.includes(mode)) {
      metadata.composerModes.push(mode);
    }
    metadata.isBackgroundAgent ||= payload["is_background_agent"] === true;
  }
  metadata.cwd ??= decodeProjectDirName(projectDirName);
  const activityTimes = [
    ...events.map(({ timestamp }) => timestamp),
    ...(transcript?.entries ?? []).flatMap((entry) =>
      entry.kind === "user" && entry.timestamp ? [entry.timestamp] : [],
    ),
  ];
  // The transcript's last write marks the end, but says nothing of the start.
  const endTimes = [
    ...activityTimes,
    ...(transcriptMtimeMs !== null
      ? [new Date(transcriptMtimeMs).toISOString()]
      : []),
  ];
  metadata.startedAt = activityTimes.sort()[0] ?? null;
  metadata.endedAt = endTimes.sort().at(-1) ?? null;
  return metadata;
};
