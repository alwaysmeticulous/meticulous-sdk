import {
  buildSummary,
  type Identity,
  MAX_AGENT_TRACE_OBJECT_BYTES,
  prepareSessionUpload,
  type TraceSession,
} from "@alwaysmeticulous/agent-traces";
import {
  type MeticulousClient,
  uploadAgentTrace,
} from "@alwaysmeticulous/client";
import type {
  TraceSessionOutcome,
  TraceSessionResult,
} from "./trace-session-result.types";
import { writeDryRunOutput } from "./write-dry-run-output";

export type TraceUploadTarget =
  | {
      kind: "upload";
      client: MeticulousClient;
      project: string | undefined;
      force: boolean;
    }
  | { kind: "dry-run"; outputDir: string | null };

export interface ProcessTraceSessionContext {
  target: TraceUploadTarget;
  excludeToolOutputRegexes: RegExp[];
  resolveIdentity: (cwd: string | null) => Identity;
  uploaderVersion: string;
}

/** Converts and uploads one session, reporting a failure rather than throwing. */
export const processTraceSession = async (
  session: TraceSession,
  context: ProcessTraceSessionContext,
): Promise<TraceSessionResult> => {
  const result = {
    agent: session.agent,
    sessionId: session.sessionId,
    sourcePaths: session.sourcePaths,
  };
  try {
    const prepared = await prepareSessionUpload(
      await session.prepare(),
      context.excludeToolOutputRegexes,
    );
    const counts = {
      stepCount: prepared.stats.stepCount,
      subagentCount: prepared.stats.subagentCount,
    };
    const largest = Math.max(
      prepared.atifGzipped.length,
      prepared.rawGzipped.length,
    );
    if (largest > MAX_AGENT_TRACE_OBJECT_BYTES) {
      return {
        ...result,
        ...counts,
        outcome: failed(`a gzipped upload is ${largest} bytes, over the limit`),
      };
    }
    const summary = buildSummary(
      prepared.stats,
      {
        ...context.resolveIdentity(prepared.stats.cwd),
        // The trace may have run anywhere, not necessarily where it's uploaded from.
        environment: "imported",
        environmentId: null,
      },
      context.uploaderVersion,
    );
    const { target } = context;
    switch (target.kind) {
      case "dry-run": {
        const outputDir = target.outputDir
          ? await writeDryRunOutput({
              ...result,
              outputDir: target.outputDir,
              prepared,
              summary,
            })
          : null;
        return {
          ...result,
          ...counts,
          outcome: { kind: "converted", outputDir },
        };
      }
      case "upload": {
        const { agentTraceId, alreadyUploaded } = await uploadAgentTrace({
          client: target.client,
          project: target.project,
          agent: session.agent,
          sessionId: session.sessionId,
          atifGzipped: prepared.atifGzipped,
          rawGzipped: prepared.rawGzipped,
          contentSha256: prepared.contentSha256,
          summary,
          force: target.force,
        });
        return {
          ...result,
          ...counts,
          outcome: {
            kind: alreadyUploaded ? "already-uploaded" : "uploaded",
            agentTraceId,
          },
        };
      }
      default: {
        const unreachable: never = target;
        return unreachable;
      }
    }
  } catch (error) {
    return {
      ...result,
      stepCount: null,
      subagentCount: null,
      outcome: failed(error instanceof Error ? error.message : String(error)),
    };
  }
};

const failed = (reason: string): TraceSessionOutcome => ({
  kind: "failed",
  reason,
});
