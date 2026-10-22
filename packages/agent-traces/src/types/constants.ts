/** `other` is ATIF from a harness Meticulous has no converter for. */
export const AGENT_TRACE_AGENTS = [
  "claude-code",
  "devin",
  "pi",
  "opencode",
  "codex",
  "cursor",
  "other",
] as const;

export type AgentTraceAgent = (typeof AGENT_TRACE_AGENTS)[number];

export const isAgentTraceAgent = (value: string): value is AgentTraceAgent =>
  (AGENT_TRACE_AGENTS as readonly string[]).includes(value);

export const AGENT_TRACE_ATIF_OBJECT_FILENAME = "trajectory.atif.json.gz";
export const AGENT_TRACE_RAW_OBJECT_FILENAME = "raw.json.gz";
export const AGENT_TRACE_METADATA_OBJECT_FILENAME = "metadata.json";

/** Cap on each uploaded (gzipped) object. */
export const MAX_AGENT_TRACE_OBJECT_BYTES = 100 * 1024 * 1024;

/**
 * Where the agent ran, as detected by the uploader from its environment.
 * Uploads triggered from inside a cloud agent's VM name the cloud product;
 * the periodic sweep on a developer's machine reports `local`. `imported`
 * marks trace files uploaded by hand, which may have run anywhere.
 */
export const AGENT_TRACE_ENVIRONMENTS = [
  "local",
  "conductor-local",
  "conductor-cloud",
  "claude-code-web",
  "cursor-cloud",
  "devin-cloud",
  "github-actions",
  "ci",
  "imported",
] as const;

export type AgentTraceEnvironment = (typeof AGENT_TRACE_ENVIRONMENTS)[number];

/**
 * Agent session ids become S3 key segments, so they are restricted to a
 * path-safe alphabet. Most agents use UUIDs; OpenCode uses `ses_…` ids.
 */
export const AGENT_TRACE_SESSION_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

/** Lowercase hex SHA-256. */
export const AGENT_TRACE_CONTENT_SHA256_REGEX = /^[a-f0-9]{64}$/;
