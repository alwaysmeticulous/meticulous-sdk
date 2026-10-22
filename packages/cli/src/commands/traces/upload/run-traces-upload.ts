import {
  createIdentityResolver,
  type FileTraceAgent,
  findTraceSessions,
  type TraceSession,
} from "@alwaysmeticulous/agent-traces";
import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CliUserError } from "../../../utils/cli-user-error";
import { getCliVersion } from "../../../utils/cli-version";
import { mapWithConcurrency } from "./map-with-concurrency";
import {
  formatTraceResult,
  logSkippedPaths,
  printTracesUploadReport,
} from "./print-trace-results";
import type {
  ProcessTraceSessionContext,
  TraceUploadTarget,
} from "./process-trace-session";
import { processTraceSession } from "./process-trace-session";
import { resolveExcludeToolOutputRegexes } from "./resolve-exclude-tool-output-regexes";
import type { TraceSessionResult } from "./trace-session-result.types";

const UPLOAD_CONCURRENCY = 4;

export interface TracesUploadOptions {
  paths: string[];
  apiToken?: string | null | undefined;
  project?: string | undefined;
  agent?: FileTraceAgent | undefined;
  excludeToolOutputRegex?: string[] | undefined;
  dryRun: boolean;
  outputDir?: string | undefined;
  force: boolean;
  json: boolean;
}

export const runTracesUpload = async (
  options: TracesUploadOptions,
): Promise<void> => {
  if (options.outputDir && !options.dryRun) {
    throw new CliUserError("--outputDir can only be used with --dryRun");
  }
  const excludeToolOutputRegexes = resolveExcludeToolOutputRegexes(
    options.excludeToolOutputRegex ?? [],
  );
  const uploaderVersion = `cli-${getCliVersion()}`;
  const logger = initLogger();
  const found = await findTraceSessions(options.paths, {
    agentOverride: options.agent ?? null,
    converterVersion: uploaderVersion,
    onUnrecognisedFile: (path) =>
      logger.debug(`Ignoring ${path}: not a recognised trace format`),
  });
  logSkippedPaths(found.skipped);
  const results =
    found.sessions.length > 0
      ? await processSessions(found.sessions, options, {
          target: await resolveTarget(options),
          excludeToolOutputRegexes,
          resolveIdentity: createIdentityResolver(),
          uploaderVersion,
        })
      : [];
  printTracesUploadReport(
    {
      dryRun: options.dryRun,
      results,
      skipped: found.skipped,
      unrecognisedFileCount: found.unrecognisedCount,
    },
    options.json,
  );
  if (results.length === 0) {
    throw new CliUserError("No agent traces found in the given paths");
  }
  const failedCount = results.filter(
    ({ outcome }) => outcome.kind === "failed",
  ).length;
  if (failedCount > 0) {
    throw new CliUserError(
      `${failedCount} of ${results.length} sessions failed`,
    );
  }
};

const processSessions = (
  sessions: TraceSession[],
  { json }: TracesUploadOptions,
  context: ProcessTraceSessionContext,
): Promise<TraceSessionResult[]> =>
  mapWithConcurrency(sessions, UPLOAD_CONCURRENCY, async (session) => {
    const result = await processTraceSession(session, context);
    if (!json) {
      console.log(formatTraceResult(result));
    }
    return result;
  });

const resolveTarget = async ({
  apiToken,
  project,
  dryRun,
  outputDir,
  force,
}: TracesUploadOptions): Promise<TraceUploadTarget> =>
  dryRun
    ? { kind: "dry-run", outputDir: outputDir ?? null }
    : {
        kind: "upload",
        client: await createClientWithOAuth({
          apiToken,
          enableOAuthLogin: true,
        }),
        project,
        force,
      };
