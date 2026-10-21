import type { MeticulousClient } from "../types/client.types";
import { maybeEnrichFetchError } from "../errors";
import type { AgentResponseNotes } from "./agent.api";
import type {
  AgenticRunBackendFailureKind,
  AgenticRunBlockedBy,
  AgenticRunCaseCheckLinkedToChange,
  AgenticRunComparisonVerdict,
  AgenticRunMockFallback,
  AgenticRunNotTestableCategory,
  AgenticRunProgressCaseStatus,
  AgenticRunResultCaseOutcome,
  AgenticRunSetupIssueCategory,
  AgenticRunSideDivergence,
  AgenticRunStepOutcome,
} from "./agentic-session-generation.api";

export type AgentSwarmRunStatus =
  | "scheduled"
  | "running"
  | "succeeded"
  | "failed"
  | "timedOut"
  | "cancelled";

/** A run row: what was tested and how the run ended. */
export interface AgentSwarmRunInfo {
  swarmRunId: string;
  status: AgentSwarmRunStatus;
  commitSha: string;
  errorMessage?: string;
}

/** How many cases ended (or currently are) in each status. */
export interface AgentSwarmCaseCounts {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  notStarted: number;
  running: number;
}

/**
 * One row of the Agent swarm run listing. Optional attributes are omitted
 * rather than `null` when absent. The case counts are present only with
 * `includeCounts`, and only for a run with a readable result (a succeeded
 * execute run).
 */
export interface AgentSwarmRunListItem extends Partial<AgentSwarmCaseCounts> {
  swarmRunId: string;
  createdAt: string;
  status: AgentSwarmRunStatus;
  commitSha: string;
  /**
   * Absent for a run not launched for a PR, and for a caller who may not see
   * the project's PR data.
   */
  prNumber?: string;
}

export interface AgentSwarmRunsResponse {
  swarmRuns: AgentSwarmRunListItem[];
  notes?: AgentResponseNotes;
}

export interface GetAgentSwarmRunsOptions {
  project?: string | undefined;
  /** Every run for the PR, across all of its commits. */
  prNumber?: string | undefined;
  /** Comma-separated Agent swarm run statuses. */
  status?: string | undefined;
  createdSince?: string | undefined;
  createdUntil?: string | undefined;
  /** Adds the case counts; lowers the maximum `limit`. */
  includeCounts?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export type AgentSwarmSetupBlockerCategory = AgenticRunSetupIssueCategory;

/**
 * How a setup-blocked flow's retry with mocked API responses ended, or
 * `unreported` when the retry never reported.
 */
export type AgentSwarmSetupBlockerFallbackOutcome =
  | "pass"
  | "fail"
  | "blocked"
  | "skipped"
  | "unreported";

export interface AgentSwarmSetupBlockerCount {
  category: AgentSwarmSetupBlockerCategory;
  count: number;
}

export interface AgentSwarmSetupBlockerEntry {
  createdAt: string;
  /** Pass with caseIndex to get_agent_swarm_run_case / agent-swarm-run-case. */
  swarmRunId: string;
  caseIndex: number;
  caseId: string;
  commitSha: string;
  category: AgentSwarmSetupBlockerCategory;
  blockedBy: AgenticRunBlockedBy;
  caseTitle: string;
  summary: string;
  evidence: string;
  suggestedFix: string;
  /**
   * Null when the flow was not retried with mocks. A `pass` verified only the
   * frontend, against recorded API responses.
   */
  fallbackOutcome: AgentSwarmSetupBlockerFallbackOutcome | null;
}

export interface AgentSwarmSetupBlockersResponse {
  /** The effective lower bound, including the default 30-day lookback. */
  since: string;
  /** Every category's count over all matching blockers, not just this page. */
  counts: AgentSwarmSetupBlockerCount[];
  setupBlockers: AgentSwarmSetupBlockerEntry[];
  notes?: AgentResponseNotes;
}

export interface GetAgentSwarmSetupBlockersOptions {
  project?: string | undefined;
  since?: string | undefined;
  category?: AgentSwarmSetupBlockerCategory | undefined;
  runId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface AgentSwarmNotTestable {
  category: AgenticRunNotTestableCategory;
  reason: string;
}

export interface AgentSwarmCaseSummary {
  /** Position in the run's case list; pass to `agent-swarm-run-case` / `get_agent_swarm_run_case`. */
  caseIndex: number;
  status: AgenticRunProgressCaseStatus;
  blockedBy?: AgenticRunBlockedBy;
  title: string;
  outcomeSummary?: string;
  /**
   * The run summary's headline finding about this case. It is written for at
   * most three of a run's cases, failures first.
   */
  takeaway?: string;
  /** Base-vs-head comparisons judged to be regressions. */
  regressionCount: number;
  /**
   * True when the reported run served modified or generated (rather than
   * recorded) mock API data, which weakens a pass and calls for checking a
   * fail against the case's `mockDataProvenance.strictRecheck`.
   */
  usedSyntheticMockData: boolean;
  /**
   * True when a test environment setup issue blocked the case against the live
   * backend and its result comes from a retry with mocked API responses: a
   * pass verified the frontend only, not the backend.
   */
  mockedBackend: boolean;
}

/**
 * The contract version this client speaks for `GET agent-swarm/run`.
 *
 * - v0 (no clientVersion sent): the response also carries `resultSource`,
 *   which older CLIs read.
 * - v1: no `resultSource`.
 */
export const AGENT_SWARM_RUN_CLIENT_VERSION = 1;

export interface AgentSwarmRunResponse {
  run: AgentSwarmRunInfo;
  /** A newer run for the same PR or commit, which supersedes this one. */
  supersededBySwarmRunId?: string;
  /**
   * Set when the run's result exists but is withheld: legacy results embed
   * source-quoting checks, so they need source-code access.
   */
  resultWithheld?: "source_code_access";
  counts?: AgentSwarmCaseCounts;
  notTestable?: AgentSwarmNotTestable;
  /** Only the cases with one of the `status` filter's statuses, when given. */
  cases: AgentSwarmCaseSummary[];
}

export interface AgentSwarmStep {
  outcome?: AgenticRunStepOutcome;
  description: string;
  /** Why a failed or blocked step went that way. */
  reason?: string;
}

export interface AgentSwarmMockDataProvenance {
  recorded: number;
  modified: number;
  generated: number;
  strictRecheck?: {
    performed: boolean;
    /** Whether the failure reproduced on recorded-only data; omitted when unsettled. */
    reproduced?: boolean;
    note?: string;
  };
}

export interface AgentSwarmComparison {
  screenshotName: string;
  verdict: AgenticRunComparisonVerdict;
  explanation: string;
}

/**
 * The independent failure checker's source-grounded review of a case the case
 * agent reported as failed: `verdict` `fail` upholds the failure, `pass` or
 * `blocked` overturns it (the case's `status` already reflects the verdict).
 */
export interface AgentSwarmCaseCheck {
  verdict: Exclude<AgenticRunResultCaseOutcome, "skipped">;
  blockedBy?: AgenticRunBlockedBy;
  confidence?: "low" | "medium" | "high";
  /** One sentence naming what is broken, for an upheld failure. */
  headline?: string;
  reason: string;
  /**
   * For an upheld failure, whether the checker found the pull request's changes
   * on the failing path. `no` means the failure stands but the change did not
   * cause it, e.g. a pre-existing bug or an unhealthy backend. Omitted for
   * checks written before this field existed.
   */
  linkedToChange?: AgenticRunCaseCheckLinkedToChange;
  linkedToChangeRationale?: string;
  /** Set when checking could not complete and the original verdict was kept. */
  error?: string;
}

/** Requests to one endpoint that failed the same way during the reported run. */
export interface AgentSwarmBackendFailure {
  method: string;
  /** `host/path`, never the query string. */
  endpoint: string;
  kind: AgenticRunBackendFailureKind;
  status?: number;
  count: number;
}

/** Network and console evidence from a case's reported run. */
export interface AgentSwarmRunEvidence {
  /** Total failing requests, including any beyond those listed. */
  backendFailureCount: number;
  /** Failing, hung or very slow backend requests, grouped by endpoint. */
  backendFailures: AgentSwarmBackendFailure[];
  pageErrors: string[];
}

export interface AgentSwarmCaseResponse {
  swarmRunId: string;
  caseIndex: number;
  title: string;
  status: AgenticRunProgressCaseStatus;
  blockedBy?: AgenticRunBlockedBy;
  outcomeSummary?: string;
  /** Evidence-backed explanation of the underlying cause, when established. */
  diagnosis?: string;
  /** Why this case was worth testing, e.g. which changed code it targets. */
  rationale?: string;
  steps: AgentSwarmStep[];
  comparisons: AgentSwarmComparison[];
  /**
   * Where the base run departed from the head's actions or mock data, with the
   * case's reason; omitted when both sides ran the same flow.
   */
  sideDivergences?: AgenticRunSideDivergence[];
  /** Where the reported run's mock API data came from; omitted when unknown. */
  mockDataProvenance?: AgentSwarmMockDataProvenance;
  /**
   * The case was blocked against the live backend by a test environment setup
   * issue (`liveAttempt`) and retried with mocked API responses. When
   * `completed`, the case's status, steps and evidence are the mocked
   * retry's, so the backend was not tested; otherwise the retry never
   * reported. Omitted when the case was not retried.
   */
  mockFallback?: AgenticRunMockFallback;
  /**
   * Backend failures and page errors during the reported run; omitted when the
   * run left none. A failure that depends on them may be environmental.
   */
  runEvidence?: AgentSwarmRunEvidence;
  /** Omitted when the case was never checked, or when `checkWithheld` is set. */
  check?: AgentSwarmCaseCheck;
  /**
   * Checks quote the project's source, so they are withheld from callers who
   * may not read its code (or when the project disables source-code access).
   */
  checkWithheld?: "source_code_access";
  /** Sessions recorded while running the case; inspect with `get_session_data`. */
  sessionIds: string[];
  /**
   * A self-contained prompt handing an upheld failure to a coding agent, when
   * the checker produced structured guidance the caller may read.
   */
  fixPrompt?: string;
}

/**
 * Names one run: by `swarmRunId`, or as the latest execution run for the
 * commit a `testRunId`, `commitSha` or `prNumber` (its head commit) stands for.
 */
export interface AgentSwarmRunTarget {
  swarmRunId?: string | undefined;
  commitSha?: string | undefined;
  prNumber?: number | undefined;
  testRunId?: string | undefined;
  project?: string | undefined;
}

const toParams = (
  values: Record<string, string | number | undefined>,
): Record<string, string> => {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value != null && value !== "") {
      params[key] = String(value);
    }
  }
  return params;
};

/**
 * Lists the project's Agent swarm runs, newest first. `limit` is always
 * applied server-side (default 100).
 */
export const getAgentSwarmRuns = async (
  client: MeticulousClient,
  options: GetAgentSwarmRunsOptions = {},
): Promise<AgentSwarmRunsResponse> => {
  const { includeCounts, ...rest } = options;
  const { data } = await client
    .get<AgentSwarmRunsResponse>("agent/agent-swarm/runs", {
      params: toParams({
        ...rest,
        includeCounts: includeCounts ? "true" : undefined,
      }),
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

/**
 * Gets recent setup blockers and per-category counts for a project's Agent
 * swarm runs. The server applies a 30-day lookback and a limit of 100 by default.
 */
export const getAgentSwarmSetupBlockers = async (
  client: MeticulousClient,
  options: GetAgentSwarmSetupBlockersOptions = {},
): Promise<AgentSwarmSetupBlockersResponse> => {
  const { data } = await client
    .get<AgentSwarmSetupBlockersResponse>("agent/agent-swarm/setup-blockers", {
      params: toParams({ ...options }),
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

/**
 * What the run and case getters answer while the run hasn't finished, in place
 * of a partial result. `message` names the run, its status and progress.
 */
export interface AgentSwarmRunProcessingResponse {
  status: "processing";
  message: string;
}

export const isAgentSwarmRunProcessingResponse = (
  value: unknown,
): value is AgentSwarmRunProcessingResponse =>
  typeof value === "object" &&
  value !== null &&
  (value as AgentSwarmRunProcessingResponse).status === "processing";

/**
 * One run's status, counts and case list, or
 * {@link AgentSwarmRunProcessingResponse} while it hasn't finished.
 * `status` is a comma-separated list of case statuses to keep.
 */
export const getAgentSwarmRun = async (
  client: MeticulousClient,
  target: AgentSwarmRunTarget,
  options?: { status?: string | undefined },
): Promise<AgentSwarmRunResponse | AgentSwarmRunProcessingResponse> => {
  const { data } = await client
    .get<AgentSwarmRunResponse | AgentSwarmRunProcessingResponse>(
      "agent/agent-swarm/run",
      {
        params: toParams({
          ...target,
          status: options?.status,
          clientVersion: AGENT_SWARM_RUN_CLIENT_VERSION,
        }),
      },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

/**
 * One case of a run in full: steps, comparisons, failure check and fix
 * prompt, or {@link AgentSwarmRunProcessingResponse} while the run hasn't
 * finished.
 */
export const getAgentSwarmRunCase = async (
  client: MeticulousClient,
  target: AgentSwarmRunTarget,
  caseIndex: number,
): Promise<AgentSwarmCaseResponse | AgentSwarmRunProcessingResponse> => {
  const { data } = await client
    .get<AgentSwarmCaseResponse | AgentSwarmRunProcessingResponse>(
      `agent/agent-swarm/run/cases/${caseIndex}`,
      { params: toParams({ ...target }) },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
