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
  username?: string | undefined;
  password?: string | undefined;
  proxyPaths?: string[] | undefined;
}

export interface AgenticAssetsAppTarget {
  type: "assets";
  assetsUploadId: string;
  backend?: AgenticAssetsBackend | undefined;
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
  /** The id of the launched agentic session generation workflow run. */
  workflowRunId?: string;
  message?: string;
}

export const requestAgenticInstructionsUpload = async ({
  client,
  projectId,
  ...body
}: RequestAgenticInstructionsUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAgenticInstructionsUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestAgenticInstructionsUploadResponse }
  >(
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
    const { data } = await client.post<
      typeof body,
      { data: CompleteAgenticSessionGenerationResponse }
    >("agentic-session-generation/launch", body, projectIdQuery(projectId));
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
  const password =
    appTarget?.type === "assets" ? appTarget.backend?.password : undefined;
  if (!password || typeof error !== "object" || error === null) {
    return;
  }
  const config = (error as { config?: { data?: unknown } }).config;
  if (typeof config?.data === "string") {
    config.data = config.data.split(password).join("[REDACTED]");
  } else if (typeof config?.data === "object" && config.data !== null) {
    const target = config.data as {
      appTarget?: { backend?: { password?: string } };
    };
    if (target.appTarget?.backend?.password) {
      target.appTarget.backend.password = "[REDACTED]";
    }
  }
};

export type AgenticRunResultCaseOutcome = "pass" | "fail" | "blocked";

export type AgenticRunResultCaseTag = "happy-path" | "edge-case" | "regression";

/**
 * Outcome of a single step. A case's outcome is derived from its steps'
 * outcomes: any failed step fails the case, otherwise any blocked step blocks
 * it, otherwise it passes.
 */
export type AgenticRunStepOutcome = AgenticRunResultCaseOutcome;

export type AgenticRunStepKind =
  | "navigate"
  | "click"
  | "input"
  | "assert"
  | "other";

/**
 * The region of a step's screenshot the reviewer should focus on, in CSS
 * pixels relative to the top-left of the (full-page) screenshot. Inferred by
 * the worker from the bounding box of the element the test last acted on
 * (clicked, filled, …) before the screenshot was taken — never supplied by the
 * model.
 */
export interface AgenticRunHighlightRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single step the agent took while running a case. */
export interface AgenticRunResultStep {
  /** What the step did, e.g. "Click the 'Schedule for later' switch". */
  description: string;
  kind?: AgenticRunStepKind;
  /** How the step went. Absent on blobs from older workers. */
  outcome?: AgenticRunStepOutcome;
  /** Extra detail, e.g. the selector used or the exact text asserted. */
  detail?: string;
  /**
   * Workdir-relative artifact path of a screenshot taken at this step (as
   * returned by the test facade's `page.screenshot`), e.g.
   * "artifacts/run-3/booked.png". Resolvable to a download URL via the run's
   * `artifactDownloadUrls` GraphQL field once the worker has uploaded it.
   */
  screenshotPath?: string;
  /** Where on the screenshot the acted-on element was, when the worker knows. */
  highlightRegion?: AgenticRunHighlightRegion;
}

/**
 * A single user flow the agent exercised, with its outcome and the sessions it
 * recorded while running it. One agentic run produces many of these.
 */
export interface AgenticRunResultCase {
  /** Short human-readable name of the flow, e.g. "Sign up with email". */
  title: string;
  /** The kind of flow this case exercises. */
  tag?: AgenticRunResultCaseTag;
  /** Short human-readable name shared by closely related cases. */
  group?: string;
  /** The steps the agent took, in order. */
  steps: AgenticRunResultStep[];
  outcome: AgenticRunResultCaseOutcome;
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

/** Versioned, agent-written summary of the completed run. */
export interface AgenticRunSummary {
  version: 1;
  takeaways: AgenticRunSummaryTakeaway[];
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

/** Versioned transcript of the planning agent and each independently-run case agent. */
export interface AgenticRunTraces {
  version: 1;
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

export interface ReportAgenticRunResultParams extends ProjectIdentifier {
  /**
   * The agentic run id the backend minted at launch and passed to the worker,
   * echoed back so the backend updates the exact run record. Optional: a worker
   * that doesn't have it falls back to matching by project + commit server-side.
   */
  agenticRunId?: string;
  /** Every session produced across the run (the union of all cases' sessions). */
  sessionIds: string[];
  cases: AgenticRunResultCase[];
  appUrl: string;
  commitSha: string;
  /** Edit-coverage for the run; omitted when coverage could not be measured. */
  coverage?: AgenticRunCoverage;
  /** How the run itself executed (timing, model, iterations), when known. */
  runMetadata?: AgenticRunMetadata;
  /** Planner and per-case agent transcripts, when captured by the worker. */
  traces?: AgenticRunTraces;
  /** Agent-written takeaways grounded in completed cases. */
  summary?: AgenticRunSummary;
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

export const reportAgenticRunResult = async ({
  client,
  projectId,
  ...body
}: ReportAgenticRunResultParams & {
  client: MeticulousClient;
}): Promise<ReportAgenticRunResultResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: ReportAgenticRunResultResponse }
  >("agentic-session-generation/result", body, projectIdQuery(projectId));
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
  const { data } = await client.get<
    unknown,
    { data: IsAgenticRunCancelledResponse }
  >("agentic-session-generation/run-cancelled", {
    params: {
      ...(projectId ? { projectId } : {}),
      agenticRunId,
    },
  });
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
  const { data } = await client.post<
    typeof body,
    { data: RequestAgenticArtifactUploadsResponse }
  >(
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
  const { data } = await client.get<
    unknown,
    { data: GetAgenticRunCoverageResponse }
  >(`agentic-session-generation/runs/${agenticRunId}/js-coverage`, {
    params: projectId ? { projectId } : {},
  });
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
  const { data } = await client.get<
    unknown,
    { data: GetAgenticChangedFilesResponse }
  >("agentic-session-generation/changed-files", {
    params: {
      ...(projectId ? { projectId } : {}),
      commitSha,
      ...(runId ? { runId } : {}),
    },
  });
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
  /** Hard cap on the returned file size in bytes. */
  maxBytes?: number;
}

export interface GetAgenticRepoFileResponse {
  kind: "found" | "missing";
  /** UTF-8 decoded file contents; present only when `kind === "found"`. */
  content?: string;
  /** `true` when the file exceeded `maxBytes` and `content` is partial. */
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
  const { data } = await client.post<
    typeof body,
    { data: GetAgenticRepoFileResponse }
  >("agentic-session-generation/repo/file", body, projectIdQuery(projectId));
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
  const { data } = await client.post<
    typeof body,
    { data: SearchAgenticRepoCodeResponse }
  >("agentic-session-generation/repo/search", body, projectIdQuery(projectId));
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
  const { data } = await client.post<
    typeof body,
    { data: GetAgenticFileChangesResponse }
  >(
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
  const { data } = await client.post<
    typeof body,
    { data: ListAgenticRepoTreeResponse }
  >("agentic-session-generation/repo/ls-tree", body, projectIdQuery(projectId));
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
  const { data } = await client.post<
    typeof body,
    { data: AcquireAgenticRepoLeaseResponse }
  >("agentic-session-generation/repo/lease/acquire", body, {
    ...projectIdQuery(projectId),
    // The acquire endpoint blocks server-side up to ~6 min bringing a cold pod
    // up (backend REPO_SERVER_ACQUIRE_REQUEST_TIMEOUT_MS). Wait that out in a
    // single attempt — with a little headroom so the server's own response
    // lands first — rather than aborting at the client's 60s default and
    // retrying, which fires several redundant bring-ups.
    timeout: 6.5 * 60 * 1000,
  });
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
  const { data } = await client.get<
    unknown,
    { data: AgenticRepoLeaseStatusResponse }
  >("agentic-session-generation/repo/lease/status", {
    params: {
      ...(projectId ? { projectId } : {}),
      ...(podInstanceId ? { podInstanceId } : {}),
    },
  });
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
  const { data } = await client.post<
    typeof body,
    { data: HeartbeatAgenticRepoLeaseResponse }
  >(
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
  const { data } = await client.post<
    typeof body,
    { data: ReleaseAgenticRepoLeaseResponse }
  >(
    "agentic-session-generation/repo/lease/release",
    body,
    projectIdQuery(projectId),
  );
  return data;
};
