import type { CoverageOrderByField } from "@alwaysmeticulous/client";

/** Every option `agent js-coverage` accepts, as yargs hands them to the handler. */
export interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  latestForProject: boolean;
  project?: string | undefined;
  replayId: string | undefined;
  screenshotName: string | undefined;
  headPlusTestRunIds: string | undefined;
  testRunIds: string | undefined;
  includeAllFiles: boolean;
  /** Repeatable, so a request can span several parts of the repo. */
  globFilter: string[] | undefined;
  prDiffOnly: boolean;
  includeExecutedRanges: boolean;
  includeExecutableRanges: boolean;
  includeUncoveredRanges: boolean;
  includeLineCounts: boolean;
  includeCoveragePercentage: boolean;
  orderBy: CoverageOrderByField | undefined;
  order: "asc" | "desc" | undefined;
  /**
   * Deliberately without a yargs default: the backend applies the default page
   * size when it isn't sent, so an unset value stays distinguishable from an
   * explicit one (a yargs default would make every invocation look like it had
   * passed the flag — see `assertLatestForProjectCompatible`'s note).
   */
  limit: number | undefined;
  offset: number | undefined;
  summary: boolean;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}
