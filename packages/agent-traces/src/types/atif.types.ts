/**
 * Harbor's Agent Trajectory Interchange Format, v1.7. Field names follow the
 * spec (snake_case) so serialised documents validate against Harbor's
 * reference validator.
 *
 * See https://github.com/harbor-framework/harbor/blob/main/rfcs/0001-trajectory-format.md
 */
export const ATIF_SCHEMA_VERSION = "ATIF-v1.7";

export type AtifExtra = Record<string, unknown>;

export interface AtifTrajectory {
  schema_version: typeof ATIF_SCHEMA_VERSION;
  /** Run-scoped; shared by a parent and its embedded subagents. */
  session_id?: string;
  /** Per-document id. Required on embedded subagent trajectories. */
  trajectory_id?: string;
  agent: AtifAgent;
  steps: AtifStep[];
  notes?: string;
  final_metrics?: AtifFinalMetrics;
  continued_trajectory_ref?: string;
  extra?: AtifExtra;
  subagent_trajectories?: AtifTrajectory[];
}

export interface AtifAgent {
  name: string;
  version: string;
  model_name?: string;
  tool_definitions?: unknown[];
  extra?: AtifExtra;
}

export interface AtifFinalMetrics {
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_cached_tokens?: number;
  total_cost_usd?: number;
  total_steps?: number;
  extra?: AtifExtra;
}

export type AtifStepSource = "system" | "user" | "agent";

export interface AtifStep {
  /** 1-based ordinal within its trajectory. */
  step_id: number;
  timestamp?: string;
  source: AtifStepSource;
  model_name?: string;
  reasoning_effort?: string | number;
  /** Required by the spec, but may be an empty string. */
  message: AtifMessageContent;
  reasoning_content?: string;
  tool_calls?: AtifToolCall[];
  observation?: AtifObservation;
  metrics?: AtifMetrics;
  llm_call_count?: number;
  is_copied_context?: boolean;
  extra?: AtifExtra;
}

export type AtifMessageContent = string | AtifContentPart[];

export type AtifContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: AtifMediaSource };

export interface AtifMediaSource {
  media_type: string;
  path: string;
}

export interface AtifToolCall {
  tool_call_id: string;
  function_name: string;
  arguments: Record<string, unknown>;
  extra?: AtifExtra;
}

export interface AtifMetrics {
  /** All input tokens, cached and uncached. */
  prompt_tokens?: number;
  completion_tokens?: number;
  /** Subset of `prompt_tokens` served from the prompt cache. */
  cached_tokens?: number;
  cost_usd?: number;
  prompt_token_ids?: number[];
  completion_token_ids?: number[];
  logprobs?: number[];
  extra?: AtifExtra;
}

export interface AtifObservation {
  results: AtifObservationResult[];
}

export interface AtifObservationResult {
  source_call_id?: string;
  content?: AtifMessageContent;
  subagent_trajectory_ref?: AtifSubagentTrajectoryRef[];
  extra?: AtifExtra;
}

/** At least one of `trajectory_id` and `trajectory_path` must be set. */
export interface AtifSubagentTrajectoryRef {
  trajectory_id?: string;
  trajectory_path?: string;
  /** Informational only; not a resolution key. */
  session_id?: string;
  extra?: AtifExtra;
}
