/**
 * Client-computed metadata about a session. Not verified by the server.
 *
 * The fields up to `uploaderVersion` are stored as `agent_traces` columns so
 * traces can be queried without downloading them; the rest are only recorded
 * in each upload's `metadata.json`, and are absent from older uploaders.
 */
export interface AgentTraceSummary {
  userEmail: string | null;
  osUsername: string | null;
  hostname: string | null;

  cwd: string | null;
  /** The last branch the session was on. */
  gitBranch: string | null;
  /** `origin` remote URL with any credentials stripped. */
  gitRemoteUrl: string | null;

  agentVersion: string | null;
  title: string | null;
  models: string[];
  /** ISO 8601. */
  startedAt: string | null;
  /** ISO 8601. */
  endedAt: string | null;
  stepCount: number;
  subagentCount: number;

  /** Includes cached and cache-creation tokens, as in ATIF. */
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalCacheCreationTokens: number;

  uploaderVersion: string;

  /** e.g. `darwin`, as reported by Node's `process.platform`. */
  platform?: string | null;
  osRelease?: string | null;
  /** IANA time zone of the uploading machine, e.g. `Europe/London`. */
  timeZone?: string | null;

  /** `gitRemoteUrl` normalised to `host/owner/repo`, e.g. `github.com/acme/shop`. */
  gitRepository?: string | null;
  /** Every branch the session was on, in the order first seen. */
  gitBranches?: string[];
  /** Pull requests the agent linked to during the session. */
  pullRequests?: AgentTracePullRequest[];

  /** How the agent was launched, e.g. Claude Code's `cli`, `sdk-ts` or `claude-vscode`. */
  entrypoint?: string | null;
  /** Every permission mode the session ran in, e.g. `default`, `plan`. */
  permissionModes?: string[];

  /** Prompts the user typed into the root agent, excluding compaction summaries. */
  userPromptCount?: number;
  compactionCount?: number;
  /** Across the root agent and every subagent. */
  toolCallCount?: number;
  toolErrorCount?: number;
  /** Most used first. */
  toolCallCounts?: AgentTraceToolCallCount[];
  /** The agent's own cost estimate, when it records one. */
  reportedCostUsd?: number | null;

  /**
   * Where the upload ran, e.g. `conductor-cloud`. One of
   * `AGENT_TRACE_ENVIRONMENTS`, but typed as a string so that older servers
   * and uploaders tolerate values they don't know.
   */
  environment?: string | null;
  /**
   * The cloud product's id for the run, e.g. the Conductor workspace or the
   * Claude Code web session.
   */
  environmentId?: string | null;
}

export interface AgentTracePullRequest {
  number: number;
  url: string;
  /** e.g. `acme/shop`. */
  repository: string | null;
}

export interface AgentTraceToolCallCount {
  toolName: string;
  count: number;
}
