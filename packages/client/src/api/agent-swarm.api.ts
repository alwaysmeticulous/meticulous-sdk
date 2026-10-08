import type { MeticulousClient } from "../types/client.types";
import { maybeEnrichFetchError } from "../errors";
import type { AgentResponseNotes } from "./agent.api";
import type {
  AgenticCaseProvenance,
  AgenticRunBackendFailureKind,
  AgenticRunBlockedBy,
  AgenticRunCaseCheckLinkedToChange,
  AgenticRunComparisonStatus,
  AgenticRunComparisonVerdict,
  AgenticRunNotTestableCategory,
  AgenticRunProgressCaseStatus,
  AgenticRunResultCaseOutcome,
  AgenticRunResultCaseTag,
  AgenticRunStepKind,
  AgenticRunStepOutcome,
} from "./agentic-session-generation.api";

export type AgentSwarmRunStatus =
  | "scheduled"
  | "running"
  | "succeeded"
  | "failed"
  | "timedOut"
  | "cancelled";

export type AgentSwarmRunMode = "execute" | "plan-only";

/**
 * Where a run is: `pending` before its worker starts, `running` while cases
 * execute, `succeeded` once it reported (whatever its cases found), and
 * `unsuccessful` for failed, timed-out and superseded runs.
 */
export type AgentSwarmRunPhase =
  | "pending"
  | "running"
  | "succeeded"
  | "unsuccessful";

/** A run row: what was tested and where the run is. */
export interface AgentSwarmRunInfo {
  swarmRunId: string;
  runMode: AgentSwarmRunMode;
  status: AgentSwarmRunStatus;
  phase: AgentSwarmRunPhase;
  commitSha: string;
  baseSha?: string;
  /**
   * The hosting provider's PR/MR number, when the run was launched for one and
   * the caller may read the project's code.
   */
  prNumber?: string;
  /** The run whose testcases this one inherited, when any. */
  baseSwarmRunId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * The test run page showing this run's results. Omitted when no test run
   * exists for its commit, or when the page shows a newer run for the commit.
   */
  url?: string;
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

export interface AgentSwarmNotTestable {
  category: AgenticRunNotTestableCategory;
  reason: string;
}

export interface AgentSwarmCaseSummary {
  /** Position in the run's case list; pass to `agent-swarm-run-case` / `get_agent_swarm_run_case`. */
  caseIndex: number;
  title: string;
  tag?: AgenticRunResultCaseTag;
  group?: string;
  /** Authored fresh, inherited unchanged, or inherited and edited. */
  provenance?: AgenticCaseProvenance;
  status: AgenticRunProgressCaseStatus;
  blockedBy?: AgenticRunBlockedBy;
  outcomeSummary?: string;
  /**
   * The run summary's headline finding about this case. It is written for at
   * most three of a run's cases, failures first.
   */
  takeaway?: string;
  stepCount: number;
  comparisonCount: number;
  /** Base-vs-head comparisons judged to be regressions. */
  regressionCount: number;
  /**
   * True when the reported run served modified or generated (rather than
   * recorded) mock API data, which weakens a pass and calls for checking a
   * fail against `mockDataProvenance.strictRecheck`.
   */
  usedSyntheticMockData: boolean;
}

export interface AgentSwarmRunResponse {
  run: AgentSwarmRunInfo;
  /** A newer run for the same PR or commit, which supersedes this one. */
  supersededBySwarmRunId?: string;
  /**
   * Where `cases` came from: the final `result`, the live `progress` snapshot
   * of a running (or abandoned) run, or `none` yet.
   */
  resultSource: "result" | "progress" | "none";
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
  stepIndex: number;
  description: string;
  kind?: AgenticRunStepKind;
  outcome?: AgenticRunStepOutcome;
  /** Why a failed or blocked step went that way. */
  reason?: string;
  detail?: string;
  /** This leading step only got the app into position for the case. */
  setup: boolean;
  /** Sanitized route the step ended on (raw URLs are never stored). */
  routeGroup?: string;
  beforeScreenshotPath?: string;
  afterScreenshotPath?: string;
  screenshotPath?: string;
  sessionId?: string;
  startTimestampMs?: number;
  endTimestampMs?: number;
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

export interface AgentSwarmComparisonSide {
  screenshotPath?: string;
  sessionId?: string;
  timestampMs?: number;
}

export interface AgentSwarmComparison {
  screenshotName: string;
  status?: AgenticRunComparisonStatus;
  mismatchFraction?: number;
  verdict: AgenticRunComparisonVerdict;
  explanation: string;
  diffPath?: string;
  base: AgentSwarmComparisonSide;
  head: AgentSwarmComparisonSide;
}

export interface AgentSwarmSourceRange {
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * The independent failure checker's source-grounded review of a case the case
 * agent reported as failed: `verdict` `fail` upholds the failure, `pass` or
 * `blocked` overturns it (the case's `status` already reflects the verdict).
 */
export interface AgentSwarmCaseCheck {
  originalOutcome: AgenticRunResultCaseOutcome;
  originalOutcomeSummary?: string;
  verdict: Exclude<AgenticRunResultCaseOutcome, "skipped">;
  blockedBy?: AgenticRunBlockedBy;
  confidence?: "low" | "medium" | "high";
  confidenceRationale?: string;
  reason: string;
  /**
   * For an upheld failure, whether the checker found the pull request's changes
   * on the failing path. `no` means the failure stands but the change did not
   * cause it, e.g. a pre-existing bug or an unhealthy backend. Omitted for
   * checks written before this field existed.
   */
  linkedToChange?: AgenticRunCaseCheckLinkedToChange;
  linkedToChangeRationale?: string;
  /** One sentence naming what is broken, for an upheld failure. */
  headline?: string;
  rootCause?: {
    explanation: string;
    evidence: Array<AgentSwarmSourceRange & { note: string; snippet?: string }>;
  };
  fix?: {
    summary: string;
    changes: Array<
      AgentSwarmSourceRange & {
        description: string;
        proposedCode?: string;
        language?: string;
      }
    >;
  };
  howToVerify: string[];
  unconfirmed?: string;
  /** Markdown diagnosis, for checks that predate structured `rootCause`. */
  diagnosis?: string;
  /** Markdown fix guidance, for checks that predate structured `fix`. */
  recommendedFix?: string;
  citations: AgentSwarmSourceRange[];
  /** Set when checking could not complete and the original verdict was kept. */
  error?: string;
}

/** Requests to one endpoint that failed the same way during the reported run. */
export interface AgentSwarmBackendFailure {
  kind: AgenticRunBackendFailureKind;
  method: string;
  /** `host/path`, never the query string. */
  endpoint: string;
  status?: number;
  error?: string;
  count: number;
  maxDurationMs?: number;
}

/** Network and console evidence from a case's reported run. */
export interface AgentSwarmRunEvidence {
  /** Failing, hung or very slow backend requests, grouped by endpoint. */
  backendFailures: AgentSwarmBackendFailure[];
  /** Total failing requests, including any beyond those listed. */
  backendFailureCount: number;
  pageErrors: string[];
}

export interface AgentSwarmCaseResponse {
  swarmRunId: string;
  caseIndex: number;
  title: string;
  tag?: AgenticRunResultCaseTag;
  group?: string;
  provenance?: AgenticCaseProvenance;
  status: AgenticRunProgressCaseStatus;
  blockedBy?: AgenticRunBlockedBy;
  outcomeSummary?: string;
  /** Evidence-backed explanation of the underlying cause, when established. */
  diagnosis?: string;
  /** Why this case was worth testing, e.g. which changed code it targets. */
  rationale?: string;
  steps: AgentSwarmStep[];
  mockDataProvenance?: AgentSwarmMockDataProvenance;
  /**
   * Backend failures and page errors during the reported run; omitted when the
   * run left none. A failure that depends on them may be environmental.
   */
  runEvidence?: AgentSwarmRunEvidence;
  compareWithBase: boolean;
  comparisons: AgentSwarmComparison[];
  /** Omitted when the case was never checked, or when `checkWithheld` is set. */
  check?: AgentSwarmCaseCheck;
  /**
   * Checks quote the project's source, so they are withheld from callers who
   * may not read its code (or when the project disables source-code access).
   */
  checkWithheld?: "source_code_access";
  /** Sessions recorded while running the case; inspect with `get_session_data`. */
  sessionIds: string[];
  /** Sessions recorded on the base deployment, for comparison only. */
  baseSessionIds: string[];
  /** The case on its run's test run page; see {@link AgentSwarmRunInfo.url}. */
  url?: string;
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
      { params: toParams({ ...target, status: options?.status }) },
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
