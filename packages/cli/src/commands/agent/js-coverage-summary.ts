import type {
  MeticulousClient,
  TestRunJsCoverageSummaryResponse,
  TestRunProcessingResponse,
} from "@alwaysmeticulous/client";
import {
  getProjectJsCoverageSummary,
  getTestRunJsCoverageSummary,
  isTestRunProcessingResponse,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import { printJson } from "../../command-utils/print-json";
import { CliUserError } from "../../utils/cli-user-error";
import { pollWhileProcessing } from "../../utils/poll-while-processing";
import { appendProjectSelectionHint } from "../../utils/project-selection-hint";
import { withBaseRunRejectionAsUserError } from "./coverage-rejection.util";
import {
  type ResolvedCoverageRuns,
  resolveFinishedCoverageRuns,
} from "./coverage-run-resolution.util";
import { formatCoverageSummary } from "./coverage-summary.util";
import type { Options } from "./js-coverage.types";

/**
 * `--summary`: the run's aggregate coverage totals. Resolves the run the same
 * way the per-file path does (or the project's latest successful run with
 * `--latestForProject`), then prints one fixed object — `key:\tvalue` lines, or
 * the same fields as JSON.
 */
export const printCoverageSummary = async (
  client: MeticulousClient,
  options: Options,
): Promise<void> => {
  const { latestForProject, project, json } = options;
  let summary: TestRunJsCoverageSummaryResponse | null;
  if (latestForProject) {
    summary = await fetchProjectCoverageSummary(client, project);
    if (summary == null) {
      // No successful run to report on. A zeroed summary would read as "this
      // project covers nothing", so JSON gets an explicit `null` and human
      // output nothing at all, with the explanation on stderr either way.
      if (json) {
        printJson(null);
      }
      return;
    }
  } else {
    const runs = await resolveFinishedCoverageRuns(client, options);
    const response = await fetchTestRunCoverageSummary(client, runs);
    if (isTestRunProcessingResponse(response)) {
      // Unfinished run, with --dontWaitForTestRunToComplete: stdout gets the
      // backend's own processing body, byte for byte what the MCP tool returns
      // for the same state — the reason is on stderr.
      if (json) {
        printJson(response);
      }
      return;
    }
    summary = response;
  }
  if (json) {
    printJson(summary);
  } else {
    for (const line of formatCoverageSummary(summary)) {
      console.log(line);
    }
  }
};

/**
 * `--summary` reports a fixed set of aggregate totals over every file the run
 * has coverage for, so none of the per-file columns or row filters mean
 * anything alongside it — and a total over a filtered subset of files is
 * precisely the mistake the summary exists to prevent, so they are rejected
 * rather than silently ignored. Only run selection, `--json` and
 * `--dontWaitForTestRunToComplete` remain compatible.
 *
 * A single replay is out too: the summary needs executable-line data, which
 * only exists for a whole test run.
 */
export const assertSummaryCompatible = (options: Options): void => {
  if (!options.summary) {
    return;
  }
  const incompatible = (
    [
      ["replayId", options.replayId != null],
      ["screenshotName", options.screenshotName != null],
      ["includeAllFiles", options.includeAllFiles],
      ["globFilter", options.globFilter != null],
      ["prDiffOnly", options.prDiffOnly],
      ["includeExecutedRanges", options.includeExecutedRanges],
      ["includeExecutableRanges", options.includeExecutableRanges],
      ["includeUncoveredRanges", options.includeUncoveredRanges],
      ["includeLineCounts", options.includeLineCounts],
      ["includeCoveragePercentage", options.includeCoveragePercentage],
      // Row ordering and paging are as meaningless as the columns: the summary
      // is one row of totals over every file, not a list to page through.
      ["orderBy", options.orderBy != null],
      ["order", options.order != null],
      ["limit", options.limit != null],
      ["offset", options.offset != null],
    ] as const
  )
    .filter(([, enabled]) => enabled)
    .map(([name]) => `--${name}`);
  if (incompatible.length > 0) {
    throw new CliUserError(
      `--summary cannot be combined with: ${incompatible.join(", ")}. ` +
        `It reports fixed aggregate totals over every file with coverage; use it on its own (optionally with --json).`,
    );
  }
};

// Waited-for runs have finished by now, so a processing response is the race
// between that check and this request — polled through like every other
// result. With --dontWaitForTestRunToComplete the request still goes out, once,
// and its processing response is the answer rather than something to poll past.
const fetchTestRunCoverageSummary = (
  client: MeticulousClient,
  runs: ResolvedCoverageRuns,
): Promise<TestRunJsCoverageSummaryResponse | TestRunProcessingResponse> => {
  const request = () =>
    withBaseRunRejectionAsUserError(() =>
      getTestRunJsCoverageSummary(client, runs.testRunId, {
        unionTestRunIds: runs.unionTestRunIds,
      }),
    );
  if (!runs.allFinished) {
    return request();
  }
  return pollWhileProcessing(request, {
    isProcessing: isTestRunProcessingResponse,
    waitingMessage: (first) => first.message,
    timeoutMessage: (last) =>
      `The coverage of test run ${runs.testRunId} did not become available within 10 minutes. ${last.message}`,
  });
};

const fetchProjectCoverageSummary = async (
  client: MeticulousClient,
  project: string | undefined,
): Promise<TestRunJsCoverageSummaryResponse | null> => {
  const { summary } = await withBaseRunRejectionAsUserError(() =>
    getProjectJsCoverageSummary(client, { project }),
  );
  if (summary == null) {
    logNotice(
      await appendProjectSelectionHint(
        "No successful test run with coverage found for this project.",
        client,
        project,
      ),
    );
    return null;
  }
  // May not be your current commit — --latestForProject always resolves the
  // project's own latest successful run. The summary itself names the run and
  // commit, so there's no separate notice for that here.
  return summary;
};
