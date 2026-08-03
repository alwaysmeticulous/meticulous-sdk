import type { Project } from "../project.types";
import type { S3Location } from "../s3.types";
import type { CompanionAssetsInfo } from "../sdk-bundle-api/sdk-to-bundle/companion-assets";
import type { ScreenshotDiffOptions } from "../sdk-bundle-api/sdk-to-bundle/screenshotting-options";
import type { TestRunTriggerDebugContext } from "./test-run-debug-context.types";

/**
 * Relevance of a session
 */
export enum SessionRelevance {
  IsPrAuthor = "is-pr-author", // Recent session recorded from the author of the PR. This is used to tag sessions before they are executed.
  IsPrAuthorRelevant = "is-pr-author-relevant", // Recent session recorded from the author of the PR, but relevant to the PR
  IsPrAuthorNotRelevant = "is-pr-author-not-relevant", // Recent session recorded from the author of the PR, but not relevant to the PR
  IsRelevantBeta = "is-relevant-beta", // Similar to IsRelevant, but used by beta relevance algorithm for A/B testing and internal evaluation
  IsRelevant = "is-relevant",
  NotRelevant = "not-relevant",
  MaybeRelevant = "maybe-relevant",
}

export const isPrAuthorRelevance = (
  relevance: SessionRelevance | null | undefined,
): boolean => {
  if (!relevance) {
    return false;
  }

  return (
    relevance === SessionRelevance.IsPrAuthor ||
    relevance === SessionRelevance.IsPrAuthorRelevant ||
    relevance === SessionRelevance.IsPrAuthorNotRelevant
  );
};

/**
 * Why a session carries the `relevanceToPR` it does, and therefore why it was
 * kept for execution or dropped. Snapshotted onto the test case alongside
 * `relevanceToPR` so that the mix of sessions we actually replay can be
 * reported directly, rather than re-derived from the MaybeRelevant sampling
 * percentage.
 *
 * Reasons are mutually exclusive: exactly one applies to a given session.
 *
 * - `direct_coverage`: the session's coverage-source replay covered an edited
 *   line (IsRelevant).
 * - `stylesheet_sibling_coverage`: the session's coverage-source replay covered
 *   the co-located sibling source file of a changed stylesheet (e.g.
 *   `foo.component.ts` for `foo.component.scss`) without covering any directly
 *   edited line (IsRelevant).
 * - `relevant_side_effect`: a file matching the "relevant" patterns (server
 *   config, migration, infra) forced every session relevant (IsRelevant).
 * - `mark_all_maybe_relevant`: a change with no precise line coverage to anchor
 *   on forced every session to MaybeRelevant.
 * - `no_coverage_or_not_chosen`: the session was not in the selected covering
 *   set and no mark-all signal fired (NotRelevant).
 * - `failed_in_coverage_source`: scheduled in the coverage source but produced
 *   no diff/result, so it likely failed there (NotRelevant).
 * - `new_relative_to_coverage_source`: absent from the coverage source
 *   entirely, so relevance is unknown and we run it (IsRelevant).
 * - `refinement_blast_radius_union`: promoted by agentic RSE refinement's
 *   sampled wider-blast-radius union (IsRelevant).
 * - `pre_annotated`: carried an upstream `relevanceToPR` annotation that takes
 *   precedence over coverage-derived relevance.
 * - `rse_skipped_sampling`: relevance never ran, and an operator load-shedding
 *   override marked the session MaybeRelevant so the standard sampling would
 *   shed it (MaybeRelevant).
 */
export type SessionRelevanceReason =
  | "direct_coverage"
  | "stylesheet_sibling_coverage"
  | "relevant_side_effect"
  | "mark_all_maybe_relevant"
  | "no_coverage_or_not_chosen"
  | "failed_in_coverage_source"
  | "new_relative_to_coverage_source"
  | "refinement_blast_radius_union"
  | "pre_annotated"
  | "rse_skipped_sampling";

export interface TestCase {
  sessionId: string;
  relevanceToPR?: SessionRelevance;
  title?: string;
  options?: TestCaseReplayOptions;

  /**
   * 1-indexed session-selection rank (1 = highest value) snapshotted at test-run
   * creation time. Used to prioritize MaybeRelevant sessions when sampling.
   */
  rankPosition?: number;

  /**
   * Why `relevanceToPR` holds the value it does. Only set by the paths that
   * derive relevance from coverage; test cases annotated elsewhere (e.g. the
   * IsPrAuthor family) and runs that predate this field leave it undefined.
   */
  relevanceReason?: SessionRelevanceReason;
}

export interface TestCaseReplayOptions extends Partial<ScreenshotDiffOptions> {
  appUrl?: string | null | undefined;

  /**
   * If present will run the session against a local server serving up previously snapshotted assets (HTML, JS, CSS etc.) from the specified prior replay, instead of against a URL.
   */
  simulationIdForAssets?: string | undefined;
}

/**
 * `PreProcessing` = the test run is undergoing some pre-processing before it can be executed.
 *
 * `Scheduled` = the test run has been created, and a cloud replay job has been queued to run it. It will switch to Running soon.
 *
 * `Running` = a worker is actively running the test run.
 *
 * `Partial` = some sessions have completed but more can be added on demand. Used for lazy session execution
 * where push test runs act as session pools — sessions are only executed when a PR needs them.
 *
 * `PostProcessing` = the replays have completed and the test run is being post-processed. This is only used for session selection runs.
 *
 * `Failure` = completed, and at least one replay had notable differences - a diff, missing-head or different-size (see has-notable-differences.ts in the main repo)
 *
 * `Success` = completed, and no replays had notable differences
 *
 * `Aborted` = the test run was stopped before it could complete
 *
 * `ExecutionError` = the test run failed fatally, and didn't complete. To get accurate results it'll need to be re-run. The test run may shortly switch back
 * into 'Running' in this case, if the worker retries it.
 */
export type TestRunStatus =
  | "PreProcessing"
  | "Scheduled"
  | "Running"
  | "Partial"
  | "PostProcessing"
  | "Success"
  | "Failure"
  | "Aborted"
  | "ExecutionError";

/**
 * Execution of a chunk of a test run chunk.
 *
 * The values and their meanings are the same as for {@link TestRunStatus}, except
 * it's not possible for a test run chunk to be in the `PostProcessing` status.
 */
export type TestRunChunkStatus = Omit<TestRunStatus, "PostProcessing">;

export type TestCaseResultStatus = "pass" | "fail" | "flake";

export interface TestCaseResult extends TestCase {
  headReplayId: string;

  /**
   * A test case is marked as a flake if there were screenshot comparison failures,
   * but for every one of those failures regenerating the screenshot on head sometimes gave
   * a different screenshot to the original screenshot taken on head.
   */
  result: TestCaseResultStatus;
}

export interface AppContainerLogsLocations {
  signedBaseUrl: string;
  pods: Array<{ podName: string; chunkKeys: string[] }>;
}

export interface TestRunDataLocations {
  coverage: S3Location;
  coverageStats: S3Location;
  coveragePr: S3Location;
  coverageStatsPr: S3Location;
  coverageReplaysByFile?: S3Location;
  coverageReplaysByFilePr?: S3Location;
  /**
   * `coverage-replays-by-file.v2.json.gz`: same line-level index as
   * `coverageReplaysByFile`, but replay sets store indices into a shared
   * `replayIds` dictionary. Served to the full coverage page when the v1
   * artifact is too large for the browser to materialize.
   */
  coverageReplaysByFileV2?: S3Location;
  coverageReplaysByFileUnmapped?: S3Location;
  coverageReplaysByFileUnmappedWithRanges?: S3Location;
  coverageScreenshotReplaysByFile?: S3Location;
  coverageScreenshotReplaysByFilePr?: S3Location;
  coverageScreenshotReplaysByFileUnmapped?: S3Location;
  coverageByReplayPr?: S3Location;
  diversityByReplay?: S3Location;
  relevantReplayContexts: S3Location;
  appContainerLogs?: AppContainerLogsLocations;
}

export interface TestRun {
  id: string;
  status: TestRunStatus;
  project: Project;
  configData: {
    testCases?: TestCase[];
  };
  resultData?: {
    results?: TestCaseResult[];
  };
  url: string;
}

/**
 * Result of resolving the "effective" test run for a (potentially network
 * patched) test run.
 *
 * When network patching (session repair) is enabled, completing the original
 * test run may trigger a hidden patching test run whose results are merged into
 * a separate merged test run. The merged test run is the one surfaced in the
 * Meticulous UI, so custom check results must be reported against it rather than
 * the original run.
 */
export interface TestRunNetworkPatchingResult {
  /**
   * The test run that custom check results should be reported against. Equal to
   * the requested test run id when no network patching applies, otherwise the
   * merged test run id once it has been created.
   */
  effectiveTestRunId: string;

  /**
   * True while a session-repair (network patching) run and/or its merged test
   * run is still expected or in progress. Clients should keep polling while this
   * is true, and report against `effectiveTestRunId` once it is false.
   */
  isNetworkPatchingInProgress: boolean;
}

export interface ExecuteSecureTunnelTestRunOptions {
  headSha: string;
  tunnelUrl: string;
  basicAuthUser: string;
  basicAuthPassword: string;
  environment: string;
  isLockable: boolean;
  companionAssetsInfo?: CompanionAssetsInfo;
  pullRequestHostingProviderId?: string;
  postComment?: boolean;
  debugContext?: TestRunTriggerDebugContext;
}

export interface ExecuteSecureTunnelTestRunResponse {
  testRun?: TestRun;
  deploymentId: string;
  message?: string;
}
