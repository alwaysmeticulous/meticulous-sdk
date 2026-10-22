import type { AtifExtra, AtifTrajectory } from "../../types/atif.types";
import { buildLeafTrajectory } from "../../atif/build-leaf-trajectory";
import type { TokenTotals } from "../../atif/token-totals";
import { sumStepTokens } from "../../atif/token-totals";
import { asNonEmptyString } from "../../utils/json-guards";
import type { OpenCodeExportSession } from "../opencode-export.types";
import { buildOpenCodeSteps } from "./build-opencode-steps";
import type { SubagentLink } from "./collect-assistant-parts";
import { messageTimeMs } from "./message-time";
import { tokenSemanticsForVersion } from "./opencode-tokens";

const OPENCODE_AGENT_NAME = "opencode";

export interface ConvertedTranscript {
  trajectory: AtifTrajectory;
  /** This session's own steps only. */
  totals: TokenTotals;
  costUsd: number;
  subagentLinks: SubagentLink[];
  startedAtMs: number | null;
  endedAtMs: number | null;
}

interface ConvertTranscriptOptions {
  session: OpenCodeExportSession;
  /** The root session's id, shared by its subagents' trajectories. */
  rootSessionId: string;
  trajectoryId: string | null;
  extra: AtifExtra;
}

/** Converts one session, without resolving any of its subagents. */
export const convertOpenCodeTranscript = ({
  session,
  rootSessionId,
  trajectoryId,
  extra,
}: ConvertTranscriptOptions): ConvertedTranscript => {
  const version = asNonEmptyString(session.info["version"]);
  const { steps, subagentLinks, unconvertedMessageCount } = buildOpenCodeSteps(
    session.messages,
    tokenSemanticsForVersion(version),
  );
  const totals = sumStepTokens(steps);
  const costUsd = steps.reduce(
    (sum, step) => sum + (step.metrics?.cost_usd ?? 0),
    0,
  );
  const trajectory = buildLeafTrajectory({
    sessionId: rootSessionId,
    trajectoryId,
    agentName: OPENCODE_AGENT_NAME,
    agentVersion: version ?? "unknown",
    steps,
    totals,
    totalCostUsd: costUsd,
    extra: {
      ...extra,
      ...(unconvertedMessageCount > 0
        ? { unconverted_message_count: unconvertedMessageCount }
        : {}),
    },
  });
  const createdTimes = session.messages.flatMap(
    ({ info }) => messageTimeMs(info, "created") ?? [],
  );
  const endTimes = session.messages.flatMap(
    ({ info }) =>
      messageTimeMs(info, "completed") ?? messageTimeMs(info, "created") ?? [],
  );
  return {
    trajectory,
    totals,
    costUsd,
    subagentLinks,
    startedAtMs: createdTimes.reduce<number | null>(
      (min, time) => (min === null ? time : Math.min(min, time)),
      null,
    ),
    endedAtMs: endTimes.reduce<number | null>(
      (max, time) => (max === null ? time : Math.max(max, time)),
      null,
    ),
  };
};
