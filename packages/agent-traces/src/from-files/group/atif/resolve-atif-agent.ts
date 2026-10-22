import {
  type AgentTraceAgent,
  isAgentTraceAgent,
} from "../../../types/constants";

const AGENT_NAME_ALIASES: Record<string, AgentTraceAgent> = {
  claude: "claude-code",
  "codex-cli": "codex",
  "cursor-agent": "cursor",
  "open-code": "opencode",
};

/** Maps names like "Claude Code" or "claude_code" to our agent ids. */
export const resolveAtifAgent = (agentName: string | null): AgentTraceAgent => {
  const normalised = (agentName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (isAgentTraceAgent(normalised)) {
    return normalised;
  }
  return AGENT_NAME_ALIASES[normalised] ?? "other";
};
