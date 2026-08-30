import type { MeticulousClient } from "../types/client.types";
import type {
  ContainerEnvVariable,
  ProjectIdentifier,
} from "./project-deployments.api";
import { projectIdQuery } from "./project-deployments.api";

export interface RequestAgenticInstructionsUploadParams extends ProjectIdentifier {
  size: number;
}

export interface RequestAgenticInstructionsUploadResponse {
  uploadUrl: string;
  /** Server-minted id that ties the uploaded instructions to a later trigger. */
  instructionsId: string;
}

export interface AgenticContainerAppTarget {
  type: "container";
  uploadId: string;
  enableLocalMocks?: boolean | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
}

export interface AgenticAssetsBackend {
  url: string;
  /**
   * Login credentials and options for the project's configured login flow,
   * keyed by the camelCased METICULOUS_STAGING_* env var suffix (e.g.
   * METICULOUS_STAGING_TOTP_SECRET becomes totpSecret). Opaque to the CLI and
   * launch API — only the worker's login flow interprets keys, so new login
   * options ship without a CLI release. Every value is treated as a secret.
   */
  loginOptions?: Record<string, string> | undefined;
  proxyPaths?: string[] | undefined;
}

export interface AgenticAssetsAppTarget {
  type: "assets";
  assetsUploadId: string;
  backend?: AgenticAssetsBackend | undefined;
  /**
   * Extra HTTPS origins the agent's browser may call besides the app origin
   * (e.g. absolute cross-origin API or auth hosts). Assets targets only.
   */
  trustedOrigins?: string[] | undefined;
  /**
   * Port to serve the uploaded frontend on. Assets targets only; the worker
   * defaults to 8000 when omitted.
   */
  appPort?: number | undefined;
}

export type AgenticAppTarget =
  | AgenticContainerAppTarget
  | AgenticAssetsAppTarget;

export interface CompleteAgenticSessionGenerationParams extends ProjectIdentifier {
  commitSha: string;
  /** Server-minted id of instructions uploaded for this trigger, if any. */
  instructionsId?: string;
  appTarget?: AgenticAppTarget | undefined;
  /** @deprecated Use appTarget.type = "container". */
  uploadId?: string | undefined;
  /** @deprecated Use appTarget.type = "container". */
  containerPort?: number | undefined;
  /** @deprecated Use appTarget.type = "container". */
  containerEnv?: ContainerEnvVariable[] | undefined;
  /** @deprecated Use appTarget.type = "container". */
  containerHealthCheckEndpoint?: string | undefined;
}

export interface CompleteAgenticSessionGenerationResponse {
  /** The backend-minted id for the launched agentic session generation run. */
  agenticRunId?: string;
  message?: string;
}

export const requestAgenticInstructionsUpload = async ({
  client,
  projectId,
  ...body
}: RequestAgenticInstructionsUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAgenticInstructionsUploadResponse> => {
  const { data } = await client.post<RequestAgenticInstructionsUploadResponse>(
    "agentic-session-generation/request-instructions-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const completeAgenticSessionGeneration = async ({
  client,
  projectId,
  ...body
}: CompleteAgenticSessionGenerationParams & {
  client: MeticulousClient;
}): Promise<CompleteAgenticSessionGenerationResponse> => {
  try {
    const { data } =
      await client.post<CompleteAgenticSessionGenerationResponse>(
        "agentic-session-generation/launch",
        body,
        projectIdQuery(projectId),
      );
    return data;
  } catch (error) {
    redactLaunchCredentials(error, body.appTarget);
    throw error;
  }
};

const redactLaunchCredentials = (
  error: unknown,
  appTarget: AgenticAppTarget | undefined,
): void => {
  const secrets =
    appTarget?.type === "assets"
      ? Object.values(appTarget.backend?.loginOptions ?? {}).filter(Boolean)
      : [];
  if (secrets.length === 0 || typeof error !== "object" || error === null) {
    return;
  }
  const config = (error as { config?: { data?: unknown } }).config;
  if (typeof config?.data === "string") {
    let redacted = config.data;
    for (const secret of secrets) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
    config.data = redacted;
  } else if (typeof config?.data === "object" && config.data !== null) {
    const target = config.data as {
      appTarget?: { backend?: { loginOptions?: Record<string, string> } };
    };
    const loginOptions = target.appTarget?.backend?.loginOptions;
    if (loginOptions != null) {
      for (const key of Object.keys(loginOptions)) {
        loginOptions[key] = "[REDACTED]";
      }
    }
  }
};

export type AgenticRunResultCaseOutcome =
  | "pass"
  | "fail"
  | "blocked"
  | "skipped";

export type AgenticRunBlockedBy = "application" | "environment";

export type AgenticRunResultCaseTag = "happy-path" | "edge-case" | "regression";

export const AGENTIC_RUN_NOT_TESTABLE_CATEGORIES = [
  "infrastructure",
  "build-or-tooling",
  "backend-only",
  "docs-or-config",
  "no-reachable-ui",
  /** The commit under test has no pull request, so there is no diff to review. */
  "no-diff",
] as const;

export type AgenticRunNotTestableCategory =
  (typeof AGENTIC_RUN_NOT_TESTABLE_CATEGORIES)[number];

/** Why a PR review intentionally completed without executing browser flows. */
export interface AgenticRunNotTestable {
  category: AgenticRunNotTestableCategory;
  reason: string;
}

/**
 * Outcome of a single step. A case's outcome is derived from its steps'
 * outcomes: any failed step fails the case, otherwise any blocked step blocks
 * it, otherwise it passes.
 */
export type AgenticRunStepOutcome = Exclude<
  AgenticRunResultCaseOutcome,
  "skipped"
>;

export type AgenticRunStepKind =
  | "navigate"
  | "click"
  | "input"
  | "assert"
  | "other";

/**
 * The region of a step's screenshot the reviewer should focus on, in CSS
 * pixels relative to the top-left of the viewport screenshot. Inferred by the
 * worker from a live DOM element's bounding box — never supplied as coordinates
 * by the model.
 */
export interface AgenticRunHighlightRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Resolved element-child paths in rrweb's replay document. */
  elementPaths?: number[][];
}

/**
 * The part of a step's URL that is the step's evidence, as a half-open character
 * range `[start, end)`. Offsets are into the sanitized route group, since raw
 * URLs are never persisted.
 */
export interface AgenticRunUrlHighlightRange {
  start: number;
  end: number;
}

/** A single step the agent took while running a case. */
export interface AgenticRunResultStep {
  /** What the step did, e.g. "Click the 'Schedule for later' switch". */
  description: string;
  kind?: AgenticRunStepKind;
  /** How the step went. Absent on blobs from older workers. */
  outcome?: AgenticRunStepOutcome;
  /**
   * Plain-English explanation of why a failed or blocked step went that way,
   * written for a reader who has not seen the test. Absent on passing steps
   * and on blobs from older workers.
   */
  reason?: string;
  /** Extra detail, e.g. the selector used or the exact text asserted. */
  detail?: string;
  /** Browser actions from the testcase execution that produced this step. */
  actionIds?: number[];
  /** Recorded session containing the linked actions, when they share one. */
  sessionId?: string;
  /** Epoch timestamp when the first linked action began executing. */
  startTimestampMs?: number;
  /**
   * Epoch timestamp of the frame the step's after evidence was captured from —
   * the one a player must freeze on for `highlightRegion` to ring the element
   * it was measured around. That is the last linked action's post-action
   * capture, or the step's explicit `screenshotPath` when it cites one, since
   * those are taken once the page has settled and can be seconds later.
   */
  endTimestampMs?: number;
  /**
   * Epoch timestamp the step's own actions finished at, present only when
   * `endTimestampMs` was pushed out past them to reach an explicit
   * verification screenshot. Everything between the two is a settle wait the
   * step did not act during, so a player can play the action at its own pace
   * and skip the wait rather than stretching one over the other.
   */
  actionEndTimestampMs?: number;
  /** Screenshot immediately before the first linked browser action. */
  beforeScreenshotPath?: string;
  /** Canonical route group for the pre-action screenshot. */
  beforeScreenshotRouteGroup?: string;
  /**
   * Worker-internal selector choosing the per-step highlight for an explicit
   * before screenshot. Use "none" to explicitly leave a step unhighlighted
   * when the screenshot measured multiple selectors. Removed before the result
   * blob is persisted.
   */
  beforeHighlight?: string;
  /** Screenshot immediately after the last linked browser action. */
  afterScreenshotPath?: string;
  /** Canonical route group for the post-action screenshot. */
  afterScreenshotRouteGroup?: string;
  /** Target region measured in the before frame. */
  beforeHighlightRegion?: AgenticRunHighlightRegion;
  /** Target region measured in the after frame. */
  afterHighlightRegion?: AgenticRunHighlightRegion;
  /**
   * Workdir-relative artifact path of a screenshot taken at this step (as
   * returned by the test facade's `page.screenshot`), e.g.
   * "artifacts/run-3/booked.png". Resolvable to a download URL via the run's
   * `artifactDownloadUrls` GraphQL field once the worker has uploaded it.
   */
  screenshotPath?: string;
  /** Canonical route group for this explicit screenshot. */
  screenshotRouteGroup?: string;
  /**
   * Worker-internal selector choosing the per-step highlight for an explicit
   * result screenshot. Use "none" to explicitly leave a step unhighlighted
   * when the screenshot measured multiple selectors. Removed before the result
   * blob is persisted.
   */
  highlight?: string;
  /**
   * Worker-internal substring of the step's URL the model wants highlighted.
   * Resolved into `urlHighlightRange`, then dropped before the blob is persisted.
   */
  urlHighlight?: string;
  /**
   * The part of the URL that is this step's evidence, indexing
   * `afterScreenshotRouteGroup` when present, else `screenshotRouteGroup`.
   */
  urlHighlightRange?: AgenticRunUrlHighlightRange;
  /** SHA-256 of the screenshot bytes, used to identify duplicate evidence. */
  screenshotContentHash?: string;
  /**
   * Legacy alias for `afterHighlightRegion`, retained for v1 readers and
   * explicit screenshots.
   */
  highlightRegion?: AgenticRunHighlightRegion;
  /**
   * @deprecated Prefer `beforeScreenshotPath`. Legacy pre-action screenshot from
   * workers that paired a single action frame with `screenshotPath` instead of
   * emitting `beforeScreenshotPath` / `afterScreenshotPath`.
   */
  legacyActionScreenshotPath?: string;
  /** @deprecated Prefer measuring highlights on `beforeScreenshotPath`. */
  legacyActionScreenshotContentHash?: string;
  /** @deprecated Prefer `beforeHighlightRegion`. */
  legacyActionHighlightRegion?: AgenticRunHighlightRegion;
}

/**
 * A single user flow the agent exercised, with its outcome and the sessions it
 * recorded while running it. One agentic run produces many of these.
 */
export type AgenticCaseProvenance = "new" | "reused" | "repaired";

export interface AgenticRunResultCase {
  /** Short human-readable name of the flow, unique within this run. */
  title: string;
  /**
   * How this run came by the case: authored fresh, inherited and re-run
   * unchanged, or inherited and edited. Derived by the worker from the case
   * file's hash — never declared by the agent.
   */
  provenance?: AgenticCaseProvenance;
  /** The kind of flow this case exercises. */
  tag?: AgenticRunResultCaseTag;
  /** Short human-readable name shared by closely related cases. */
  group?: string;
  /** The steps the agent took, in order. */
  steps: AgenticRunResultStep[];
  outcome: AgenticRunResultCaseOutcome;
  /** What prevented verification. Present only when `outcome` is `blocked`. */
  blockedBy?: AgenticRunBlockedBy;
  /**
   * Concise user-visible account of what happened and, for a non-passing case,
   * the concrete reason. Optional for result blobs written by older workers.
   */
  outcomeSummary?: string;
  /** Evidence-backed explanation of the underlying cause, when established. */
  diagnosis?: string;
  /** Sessions recorded while running this case. */
  sessionIds: string[];
  /** Why this case was worth testing, e.g. which changed code it targets. */
  rationale?: string;
  /**
   * @deprecated Legacy workers may have included free-form notes. New workers
   * report step outcomes instead.
   */
  notes?: string;
}

export interface AgenticRunSummaryTakeaway {
  /** Index into the run's `cases` array. */
  caseIndex: number;
  /** Short, agent-written finding grounded in that case's result. */
  text: string;
}

/** Agent-written summary of the completed run. */
export interface AgenticRunSummary {
  takeaways: AgenticRunSummaryTakeaway[];
}

export type AgentReviewMemoryCandidateCategory =
  | "app-structure"
  | "navigation"
  | "authentication"
  | "test-data"
  | "networking"
  | "testing-pitfall";

export type AgentReviewMemoryCandidateAudience = "planner" | "case-runner";

/**
 * A bounded, untrusted observation proposed by an Agent Review agent for
 * possible inclusion in the project's persistent memory.
 */
export interface AgentReviewMemoryCandidate {
  tip: string;
  category: AgentReviewMemoryCandidateCategory;
  audiences: AgentReviewMemoryCandidateAudience[];
}

/** Coarse metadata about how the agentic run itself executed. */
export interface AgenticRunMetadata {
  /** ISO timestamp the worker started the run. */
  startedAt?: string;
  /** ISO timestamp the worker finished driving and reported. */
  finishedAt?: string;
  /** The model the agent ran on. */
  model?: string;
  /** Number of runTest invocations across the run. */
  iterations?: number;
}

export type AgenticRunTraceEventKind =
  | "system-prompt"
  | "user-prompt"
  | "assistant"
  | "tool-use"
  | "tool-result"
  | "result"
  | "error";

export interface AgenticRunTraceEvent {
  timestamp: string;
  kind: AgenticRunTraceEventKind;
  text: string;
  toolName?: string;
  toolUseId?: string;
  isError?: boolean;
}

export interface AgenticRunTraceUsage {
  status: "success" | "error" | "unknown";
  stopReason?: string;
  durationMs: number;
  numTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
}

export interface AgenticRunTrace {
  events: AgenticRunTraceEvent[];
  truncated: boolean;
  /** Terminal status and model usage reported by this SDK query. */
  usage?: AgenticRunTraceUsage;
}

export interface AgenticRunCaseTrace extends AgenticRunTrace {
  caseIndex: number;
  caseTitle: string;
}

/** Transcript of the planning agent and each independently-run case agent. */
export interface AgenticRunTraces {
  planner: AgenticRunTrace;
  cases: AgenticRunCaseTrace[];
}

export interface AgenticRunCoverageFile {
  /** Repo-relative post-edit path. */
  path: string;
  /**
   * Edited lines the coverage tool could observe (this file's denominator), as
   * inclusive [start, end] line ranges.
   */
  executableEditedRanges: Array<[number, number]>;
  /**
   * Executable-edited lines the run covered (a subset of
   * `executableEditedRanges`), as inclusive [start, end] line ranges.
   */
  coveredEditedRanges: Array<[number, number]>;
}

/**
 * Edit-coverage for the run: how much of the PR's changed code the produced
 * sessions exercised. Omitted entirely when coverage could not be measured
 * (e.g. the app under test served no source maps).
 *
 * The canonical, non-redundant coverage shape (structurally the `EditCoverage`
 * produced by `@alwaysmeticulous/coverage-utils`): only the executable and
 * covered edited ranges are carried per file; aggregate counts, the fraction,
 * and residual-uncovered ranges are all DERIVED by consumers, never stored.
 */
export interface AgenticRunCoverage {
  perFile: AgenticRunCoverageFile[];
  /** Edited files with no coverage data at all (unmappable / not loaded). */
  unobservedFiles: string[];
}

/**
 * The `{ cases, coverage, runMetadata, traces, summary }` document stored in S3
 * for one run — everything about a run that is too big to belong on its row.
 * Uploaded by the worker straight to a presigned URL; read back by the webapp
 * via the run's `resultBlobUrl`, and by the backend for its coverage.
 */
export interface AgenticRunResultBlob {
  /**
   * Format version of this document, so a reader holding only the bytes can
   * tell whether it can parse them. `AGENTIC_RESULT_VERSION` in
   * `@alwaysmeticulous/common-utils` is the current value and documents when to
   * bump it; absent means the blob predates versioning and reads as version 1.
   */
  version: number;
  cases: AgenticRunResultCase[];
  /** Edit-coverage for the run; omitted when coverage could not be measured. */
  coverage?: AgenticRunCoverage;
  /** How the run itself executed (timing, model, iterations), when known. */
  runMetadata?: AgenticRunMetadata;
  /** Planner and per-case agent transcripts, when captured by the worker. */
  traces?: AgenticRunTraces;
  /** Agent-written takeaways grounded in completed cases. */
  summary?: AgenticRunSummary;
  /** Untrusted project-memory observations proposed during this run. */
  memoryCandidates?: AgentReviewMemoryCandidate[];
  /** Present when the agent determined no browser flow can exercise the change. */
  notTestable?: AgenticRunNotTestable;
}

export interface ReportAgenticRunResultResponse {
  message?: string;
  /**
   * Whether the backend actually stored the result on a run record. False when
   * the report could not be correlated to a run or the run already had a
   * terminal result (the response is still a 200 so terminal reports never
   * fail the worker).
   */
  recorded?: boolean;
}

export type AgenticResultArtifactKind = "review" | "coverage" | "traces";

export interface RequestAgenticResultUploadParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch (env `AGENTIC_RUN_ID`). */
  agenticRunId: string;
  /** A typed result artifact. The server derives its S3 key from this value. */
  kind: AgenticResultArtifactKind;
  /** Size in bytes of the blob about to be PUT, signed into the URL. */
  size: number;
}

export interface RequestAgenticResultUploadResponse {
  uploadUrl: string;
}

/**
 * Requests a presigned URL for the run's result blob, so the worker PUTs the
 * payload straight to S3 rather than sending it through the API. The key is
 * derived server-side from the run, so the caller never names its destination.
 * Followed by {@link completeAgenticRunResult} once the PUT succeeds.
 */
export const requestAgenticResultUpload = async ({
  client,
  projectId,
  ...body
}: RequestAgenticResultUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAgenticResultUploadResponse> => {
  const { data } = await client.post<RequestAgenticResultUploadResponse>(
    "agentic-session-generation/request-result-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface CompleteAgenticRunResultParams extends ProjectIdentifier {
  /** The agentic run id the blob was keyed on when its upload was presigned. */
  agenticRunId: string;
  /** Every session produced across the run (the union of all cases' sessions). */
  sessionIds: string[];
  /** Whether the run intentionally completed without browser-exercisable cases. */
  notTestable?: boolean;
}

/**
 * Points a run at the result blob the worker has already uploaded. Everything
 * else the run records — its commit and app URL — the backend wrote at launch.
 */
export const completeAgenticRunResult = async ({
  client,
  projectId,
  ...body
}: CompleteAgenticRunResultParams & {
  client: MeticulousClient;
}): Promise<ReportAgenticRunResultResponse> => {
  const { data } = await client.post<ReportAgenticRunResultResponse>(
    "agentic-session-generation/complete-result",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

/**
 * Lifecycle state of one case in a run's progress snapshot: `not-started` and
 * `running` while the case is still in flight, then its outcome
 * (`pass`/`fail`/`blocked`) once it has reported.
 */
export type AgenticRunProgressCaseStatus =
  | "not-started"
  | "running"
  | AgenticRunResultCaseOutcome;

/**
 * One case in a run's progress snapshot. Planning metadata is present from the
 * moment the plan is submitted; `steps`/`sessionIds`/`outcome` only appear once
 * the case has reported (at which point `status` carries the outcome).
 */
export interface AgenticRunProgressCase {
  title: string;
  status: AgenticRunProgressCaseStatus;
  tag?: AgenticRunResultCaseTag;
  group?: string;
  rationale?: string;
  steps?: AgenticRunResultStep[];
  sessionIds?: string[];
  outcome?: AgenticRunResultCaseOutcome;
}

export interface ReportAgenticRunFailureParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch (env `AGENTIC_RUN_ID`). */
  agenticRunId: string;
  /** The error that killed the run. */
  errorMessage: string;
}

/**
 * The worker's dying report: moves the run to a terminal `failed` status with
 * the error that killed it, so a crash surfaces immediately instead of the run
 * sitting `scheduled`/`running` until the backend's staleness reaper times it
 * out. An unmatched or already-terminal report is still a 200 (`recorded:
 * false`) — the worker is about to exit and can do nothing with an error.
 */
export const reportAgenticRunFailure = async ({
  client,
  projectId,
  ...body
}: ReportAgenticRunFailureParams & {
  client: MeticulousClient;
}): Promise<ReportAgenticRunResultResponse> => {
  const { data } = await client.post<ReportAgenticRunResultResponse>(
    "agentic-session-generation/report-failure",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

/**
 * The throttled, last-value-wins JSON the worker overwrites at
 * `{prefix}/{projectId}/{runId}/review_progress.json` from the moment its plan exists
 * until it reports its terminal result (which stays authoritative).
 */
export interface AgenticRunProgressSnapshot {
  cases: AgenticRunProgressCase[];
}

export interface RequestAgenticProgressUploadParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch (env `AGENTIC_RUN_ID`). */
  agenticRunId: string;
}

export interface RequestAgenticProgressUploadResponse {
  uploadUrl: string;
}

/**
 * Requests a presigned upload URL for the run's progress snapshot. Deliberately
 * takes no path: there is exactly one snapshot per run and the backend derives
 * its key, so no part of the destination is caller-controlled. The worker calls
 * this once at startup and again whenever the URL's credentials expire mid-run;
 * the first call also moves the run's status from `scheduled` to `running`.
 */
export const requestAgenticProgressUpload = async ({
  client,
  projectId,
  ...body
}: RequestAgenticProgressUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAgenticProgressUploadResponse> => {
  const { data } = await client.post<RequestAgenticProgressUploadResponse>(
    "agentic-session-generation/request-progress-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface IsAgenticRunCancelledParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch (env `AGENTIC_RUN_ID`). */
  agenticRunId: string;
}

export interface IsAgenticRunCancelledResponse {
  /**
   * `true` once the run has been cancelled (e.g. superseded by a newer run for
   * the same PR).
   */
  cancelled: boolean;
}

/**
 * Returns whether the run has been cancelled — a point-in-time query the worker
 * polls throughout its run. On the first `true` the worker aborts its agent and
 * exits without reporting a result; the run's terminal `cancelled` status was
 * already set by whoever requested the cancellation.
 */
export const isAgenticRunCancelled = async ({
  client,
  projectId,
  agenticRunId,
}: IsAgenticRunCancelledParams & {
  client: MeticulousClient;
}): Promise<IsAgenticRunCancelledResponse> => {
  const { data } = await client.get<IsAgenticRunCancelledResponse>(
    "agentic-session-generation/run-cancelled",
    {
      params: {
        ...(projectId ? { projectId } : {}),
        agenticRunId,
      },
    },
  );
  return data;
};

export interface RequestAgenticTestcasesUploadParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch (env `AGENTIC_RUN_ID`). */
  agenticRunId: string;
  /** Bundle size in bytes. */
  size: number;
}

export interface RequestAgenticTestcasesUploadResponse {
  uploadUrl: string;
}

/**
 * Requests a presigned upload URL for the run's testcase bundle — the verbatim
 * code of every testcase, which the next run on the same PR inherits as
 * its baseline. Deliberately takes no path: there is exactly one bundle per run
 * and the backend derives its key, so no part of the destination is
 * caller-controlled.
 */
export const requestAgenticTestcasesUpload = async ({
  client,
  projectId,
  ...body
}: RequestAgenticTestcasesUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAgenticTestcasesUploadResponse> => {
  const { data } = await client.post<RequestAgenticTestcasesUploadResponse>(
    "agentic-session-generation/request-testcases-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface AgenticArtifactUploadFile {
  /**
   * Workdir-relative artifact path, e.g. "artifacts/run-3/booked.png". Must
   * stay inside the artifacts directory (no ".." segments).
   */
  path: string;
  /** File size in bytes. */
  size: number;
}

export interface RequestAgenticArtifactUploadsParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch (env `AGENTIC_RUN_ID`). */
  agenticRunId: string;
  files: AgenticArtifactUploadFile[];
}

export interface RequestAgenticArtifactUploadsResponse {
  uploads: Array<{ path: string; uploadUrl: string }>;
}

/**
 * Requests presigned upload URLs for run artifacts (the screenshots the agent
 * took while driving), stored next to the run's result blob. The worker calls
 * this just before reporting the result, so the report's `screenshotPath`
 * references resolve for readers.
 */
export const requestAgenticArtifactUploads = async ({
  client,
  projectId,
  ...body
}: RequestAgenticArtifactUploadsParams & {
  client: MeticulousClient;
}): Promise<RequestAgenticArtifactUploadsResponse> => {
  const { data } = await client.post<RequestAgenticArtifactUploadsResponse>(
    "agentic-session-generation/request-artifact-uploads",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface GetAgenticRunCoverageParams extends ProjectIdentifier {
  /** The agentic run id the backend minted at launch. */
  agenticRunId: string;
}

export interface GetAgenticRunCoverageResponse {
  /**
   * The run's edit-coverage, read out of its result blob. `null` when the run has
   * no result yet or measured no coverage at all (e.g. the app under test served
   * no source maps) — distinct from a measured-but-empty `perFile`, which must
   * not be read as "the agent covered nothing".
   */
  coverage: AgenticRunCoverage | null;
}

/**
 * Reads one agentic run's edit-coverage. The counterpart to
 * `GET /api/agent/test-runs/:id/js-coverage` for the normal test run, so the two
 * can be compared over a shared denominator without either caller touching S3.
 *
 * Gated on source-code access like the other coverage reads: per-file ranges name
 * the project's changed source paths.
 */
export const getAgenticRunCoverage = async ({
  client,
  projectId,
  agenticRunId,
}: GetAgenticRunCoverageParams & {
  client: MeticulousClient;
}): Promise<GetAgenticRunCoverageResponse> => {
  const { data } = await client.get<GetAgenticRunCoverageResponse>(
    `agentic-session-generation/runs/${agenticRunId}/js-coverage`,
    {
      params: projectId ? { projectId } : {},
    },
  );
  return data;
};

export interface GetAgenticChangedFilesParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
}

export interface AgenticChangedFile {
  filename: string;
  status?: string;
}

export interface GetAgenticChangedFilesResponse {
  /** `null` when no PR/diff is available or source access is disabled. */
  files: AgenticChangedFile[] | null;
  /**
   * The resolved PR base sha, or `null` under the same conditions `files` is
   * `null`. Lets a caller that only has the head commit sha (e.g. the agentic
   * session generation worker) call `getRelevantSessions`, which requires a
   * `baseCommitSha`.
   */
  baseSha: string | null;
}

/**
 * Lists the files the PR under test touched. Served cap-free off the project's
 * repo-server mirror where possible, falling back to the hosting provider. When
 * `runId` is supplied the mirror read borrows the worker's durable run lease (a
 * warm pod) instead of acquiring a fresh short-lived one; a missing/stale lease
 * falls back to the leaseless path server-side.
 */
export const getAgenticChangedFiles = async ({
  client,
  projectId,
  commitSha,
  runId,
}: GetAgenticChangedFilesParams & {
  client: MeticulousClient;
}): Promise<GetAgenticChangedFilesResponse> => {
  const { data } = await client.get<GetAgenticChangedFilesResponse>(
    "agentic-session-generation/changed-files",
    {
      params: {
        ...(projectId ? { projectId } : {}),
        commitSha,
        ...(runId ? { runId } : {}),
      },
    },
  );
  return data;
};

/**
 * The agentic run id (workflow run id) a read carries so the backend borrows the
 * worker's durable repo-server lease — discovered by this id — instead of
 * acquiring a fresh short-lived lease per read. Optional: absent (or a lease
 * that's since gone) falls back to the leaseless per-read path server-side.
 */
export interface AgenticRepoLeaseRef {
  runId?: string;
}

export interface GetAgenticRepoFileParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
  path: string;
  /** First source line to return (1-indexed, inclusive). Defaults to 1. */
  startLine?: number;
  /** Last source line to return (1-indexed, inclusive). Defaults to EOF. */
  endLine?: number;
  /** Hard cap on the returned content in bytes, applied after line selection. */
  maxBytes?: number;
}

export interface GetAgenticRepoFileResponse {
  kind: "found" | "missing";
  /** UTF-8 decoded file contents; present only when `kind === "found"`. */
  content?: string;
  /** `true` when the selected content exceeded `maxBytes` and is partial. */
  truncated?: boolean;
  /** Total file size in bytes before any truncation. */
  sizeBytes?: number;
}

/** Reads a single source file from the project's repo at `commitSha`. */
export const getAgenticRepoFile = async ({
  client,
  projectId,
  ...body
}: GetAgenticRepoFileParams & {
  client: MeticulousClient;
}): Promise<GetAgenticRepoFileResponse> => {
  const { data } = await client.post<GetAgenticRepoFileResponse>(
    "agentic-session-generation/repo/file",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface SearchAgenticRepoCodeParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
  pattern: string;
  /** Restrict the search to these path prefixes. */
  paths?: string[];
  caseInsensitive?: boolean;
  /** Lines of context to return around each match. */
  contextLines?: number;
  /** Hard cap on the number of matches returned. */
  maxMatches?: number;
}

export interface AgenticRepoSearchMatch {
  path: string;
  lineNumber: number;
  line: string;
  before: string[];
  after: string[];
}

export interface SearchAgenticRepoCodeResponse {
  matches: AgenticRepoSearchMatch[];
  /** `true` when `maxMatches` was reached and trailing matches were dropped. */
  truncated: boolean;
}

/** Searches the project's repo (ripgrep) at `commitSha`. */
export const searchAgenticRepoCode = async ({
  client,
  projectId,
  ...body
}: SearchAgenticRepoCodeParams & {
  client: MeticulousClient;
}): Promise<SearchAgenticRepoCodeResponse> => {
  const { data } = await client.post<SearchAgenticRepoCodeResponse>(
    "agentic-session-generation/repo/search",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface GetAgenticFileChangesParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
  /** Repo-relative path of the file whose changes to return. */
  path: string;
}

export interface GetAgenticFileChangesResponse {
  /**
   * The file's unified diff (base..head) as raw patch text, or `null` when no
   * PR/diff is available or source access is disabled. Empty string when the
   * file is unchanged.
   */
  diff: string | null;
}

/**
 * Returns how a single file changed in the PR under test (unified-diff hunks).
 * The worker uses this to compute edit-coverage; the agent uses it to see what
 * changed in a file it is about to exercise.
 */
export const getAgenticFileChanges = async ({
  client,
  projectId,
  ...body
}: GetAgenticFileChangesParams & {
  client: MeticulousClient;
}): Promise<GetAgenticFileChangesResponse> => {
  const { data } = await client.post<GetAgenticFileChangesResponse>(
    "agentic-session-generation/repo/file-changes",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface ListAgenticRepoTreeParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
  /** Tree path inside the commit. Defaults to the repo root. */
  path?: string;
  /** When true, walks descendants recursively. */
  recursive?: boolean;
  /** Hard cap on the number of entries returned. */
  maxEntries?: number;
}

export interface AgenticRepoTreeEntry {
  type: "blob" | "tree" | "commit";
  path: string;
  /** Blob size in bytes; `null` for trees/submodules and blobless-mirror blobs. */
  sizeBytes: number | null;
}

export interface ListAgenticRepoTreeResponse {
  entries: AgenticRepoTreeEntry[];
  /** `true` when `maxEntries` was reached and trailing entries were dropped. */
  truncated: boolean;
}

/** Lists a tree in the project's repo at `commitSha`. */
export const listAgenticRepoTree = async ({
  client,
  projectId,
  ...body
}: ListAgenticRepoTreeParams & {
  client: MeticulousClient;
}): Promise<ListAgenticRepoTreeResponse> => {
  const { data } = await client.post<ListAgenticRepoTreeResponse>(
    "agentic-session-generation/repo/ls-tree",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface ListAgenticRepoSourceFilesParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
}

export interface ListAgenticRepoSourceFilesResponse {
  /** Repo-relative paths eligible for source-map coverage. */
  paths: string[];
  /** `true` when paths were filtered from only a bounded tree prefix. */
  truncated: boolean;
}

/** Lists source-map coverage candidates in the project's repo. */
export const listAgenticRepoSourceFiles = async ({
  client,
  projectId,
  ...body
}: ListAgenticRepoSourceFilesParams & {
  client: MeticulousClient;
}): Promise<ListAgenticRepoSourceFilesResponse> => {
  const { data } = await client.post<ListAgenticRepoSourceFilesResponse>(
    "agentic-session-generation/repo/source-files",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface AcquireAgenticRepoLeaseParams extends ProjectIdentifier {
  /** The agentic run id (workflow run id) the lease is keyed on. */
  runId: string;
}

export interface AcquireAgenticRepoLeaseResponse {
  leaseId: string;
  podInstanceId?: string;
  recommendedHeartbeatIntervalMs: number;
  heartbeatTtlMs: number;
}

/**
 * Acquires a durable repo-server lease for the whole agentic run and kicks off
 * the mirror clone. Blocks only on the bounded pod-boot step; poll
 * {@link getAgenticRepoLeaseStatus} for the clone. The caller must heartbeat
 * (see {@link heartbeatAgenticRepoLease}) and release it
 * ({@link releaseAgenticRepoLease}). Source access is a hard requirement, so this
 * rejects (403) rather than returning an "unavailable" result when the
 * `ALLOW_CODE_ACCESS` kill switch is off, the project disables source access, or
 * the project isn't enrolled.
 */
export const acquireAgenticRepoLease = async ({
  client,
  projectId,
  ...body
}: AcquireAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<AcquireAgenticRepoLeaseResponse> => {
  const { data } = await client.post<AcquireAgenticRepoLeaseResponse>(
    "agentic-session-generation/repo/lease/acquire",
    body,
    {
      ...projectIdQuery(projectId),
      // The acquire endpoint blocks server-side up to ~6 min bringing a cold pod
      // up (backend REPO_SERVER_ACQUIRE_REQUEST_TIMEOUT_MS). Wait that out in a
      // single attempt — with a little headroom so the server's own response
      // lands first — rather than aborting at the client's 60s default and
      // retrying, which fires several redundant bring-ups.
      timeout: 6.5 * 60 * 1000,
    },
  );
  return data;
};

export interface GetAgenticRepoLeaseStatusParams extends ProjectIdentifier {
  /** Instance id of the lease-holding pod (from acquire), if any. */
  podInstanceId?: string;
}

export interface AgenticRepoLeaseStatusResponse {
  /** `true` when the pod is up and its git mirror has finished cloning. */
  ready: boolean;
}

/**
 * Returns whether the held lease's pod + git mirror are ready right now — a
 * single point-in-time status query, not a wait. The caller drives its own poll
 * loop (source reads simply retry a mirror that's still cloning).
 */
export const getAgenticRepoLeaseStatus = async ({
  client,
  projectId,
  podInstanceId,
}: GetAgenticRepoLeaseStatusParams & {
  client: MeticulousClient;
}): Promise<AgenticRepoLeaseStatusResponse> => {
  const { data } = await client.get<AgenticRepoLeaseStatusResponse>(
    "agentic-session-generation/repo/lease/status",
    {
      params: {
        ...(projectId ? { projectId } : {}),
        ...(podInstanceId ? { podInstanceId } : {}),
      },
    },
  );
  return data;
};

export interface HeartbeatAgenticRepoLeaseParams extends ProjectIdentifier {
  leaseId: string;
  podInstanceId?: string;
}

export interface HeartbeatAgenticRepoLeaseResponse {
  ok: boolean;
  expiresAt?: string;
}

/** Heartbeats the held lease to keep it alive for the run's lifetime. */
export const heartbeatAgenticRepoLease = async ({
  client,
  projectId,
  ...body
}: HeartbeatAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<HeartbeatAgenticRepoLeaseResponse> => {
  const { data } = await client.post<HeartbeatAgenticRepoLeaseResponse>(
    "agentic-session-generation/repo/lease/heartbeat",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface ReleaseAgenticRepoLeaseParams extends ProjectIdentifier {
  leaseId: string;
  podInstanceId?: string;
}

export interface ReleaseAgenticRepoLeaseResponse {
  released: boolean;
}

/** Releases the held lease at the end of the run (best-effort). */
export const releaseAgenticRepoLease = async ({
  client,
  projectId,
  ...body
}: ReleaseAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<ReleaseAgenticRepoLeaseResponse> => {
  const { data } = await client.post<ReleaseAgenticRepoLeaseResponse>(
    "agentic-session-generation/repo/lease/release",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface SearchRecordedRequestsParams extends ProjectIdentifier {
  method: string;
  /**
   * Absolute URL of the request to look for. Only its path reaches the fuzzy
   * hash, but a relative URL cannot be parsed, so callers resolve it first.
   */
  url: string;
  /** Request body, when there is one. Only its structure affects matching. */
  body?: string;
  /** Page size, capped at 20. */
  limit?: number;
  /** Zero-based page offset. */
  offset?: number;
  /** Narrows a shape search to a candidate session printed by an earlier page. */
  sessionId?: string;
  /** Narrows a shape search to a candidate hash printed by an earlier page. */
  hash?: string;
  /** Returns the complete selected request document, including bodies. */
  includeDetails?: boolean;
}

/** Details available only when the recorded document is small enough to read. */
export interface RecordedRequestDetails {
  method: string;
  url: string;
  responseStatus: number;
  mimeType: string;
  requestBodySize: number;
  responseBodySize: number;
}

/** One recorded request whose fuzzy hash matched. */
export interface RecordedRequestMatch {
  sessionId: string;
  hash: string;
  /** True when only a one-segment wildcard shape matched. */
  nearMatch?: boolean;
  /** Full stored document size, including request and response bodies. */
  size: number;
  /** Null when the document exceeds the broad-search detail-read limit. */
  details: RecordedRequestDetails | null;
  /** Complete exchange, returned only for an exact `includeDetails` selection. */
  request?: RecordedRequestDocument;
}

export interface SearchRecordedRequestsResponse {
  matches: RecordedRequestMatch[];
  /** Offset for the next page, or null when this was the final page. */
  nextOffset: number | null;
}

/**
 * Finds recorded requests across the project whose fuzzy hash matches the given
 * one — the same corpus and hashing network patching uses to find a fresh
 * response for a stale request.
 *
 * Matching is forgiving about values and strict about structure: only the method,
 * the normalised path, and either the GraphQL operation names / variable names /
 * field paths or the top-level body keys are hashed. Values and query strings are
 * not, so an exemplar with placeholder ids still matches.
 */
export const searchRecordedRequests = async ({
  client,
  projectId,
  ...body
}: SearchRecordedRequestsParams & {
  client: MeticulousClient;
}): Promise<SearchRecordedRequestsResponse> => {
  const { data } = await client.post<SearchRecordedRequestsResponse>(
    "agentic-session-generation/recorded-requests/search",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface GetRecordedRequestParams extends ProjectIdentifier {
  sessionId: string;
  hash: string;
}

/** A stored request, with enough of the exchange to rebuild its HAR entry. */
export interface RecordedRequestDocument {
  sessionId: string;
  hash: string;
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  /** PollyJS can record an object value here, e.g. for `?obj[key]=1`. */
  queryString: Array<{ name: string; value: object | string }>;
  postData?: { mimeType: string; text?: string };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content: { mimeType: string; text?: string; encoding?: string };
  };
}

export type GetRecordedRequestResponse =
  | { kind: "found"; request: RecordedRequestDocument }
  | { kind: "missing" }
  | { kind: "too-large"; size: number; maxSize: number };

/**
 * Reads one recorded request in full, addressed by the session that recorded it
 * and its hash. `kind: "missing"` when the payload is gone — the index row can
 * outlive the stored object — and `kind: "too-large"` when reading it into the
 * backend process would exceed the safety limit.
 */
export const getRecordedRequest = async ({
  client,
  projectId,
  sessionId,
  hash,
}: GetRecordedRequestParams & {
  client: MeticulousClient;
}): Promise<GetRecordedRequestResponse> => {
  const { data } = await client.get<GetRecordedRequestResponse>(
    `agentic-session-generation/recorded-requests/${encodeURIComponent(
      sessionId,
    )}/${encodeURIComponent(hash)}`,
    { params: { ...(projectId ? { projectId } : {}) } },
  );
  return data;
};
