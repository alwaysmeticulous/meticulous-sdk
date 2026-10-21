import { isCI, name as CIName } from "ci-info";

export type Environment =
  | {
      isCI: false;
    }
  | {
      isCI: true;
      ci: {
        name: string | null;
      };
    };

export const getEnvironment = (): Environment => {
  if (!isCI) {
    return { isCI: false };
  }

  return {
    isCI: true,
    ci: {
      name: CIName,
    },
  };
};

/**
 * Whether stderr is more likely read by a coding agent than by a human at a
 * terminal, for notices addressed to agents only.
 */
export const isLikelyRunByAgent = (): boolean =>
  CODING_AGENT_ENV_CHECKS.some((check) => check(process.env)) ||
  process.stderr.isTTY !== true;

/**
 * Set by coding agents only on the commands they run themselves, never in a
 * terminal a human types into - which rules out e.g. `CLAUDECODE` and
 * `CURSOR_TRACE_ID`, set in Claude Code's IDE and every Cursor terminal.
 * Needed on top of the TTY check because Cursor's agent and Codex's unified
 * exec run commands in a pseudo-terminal.
 */
const CODING_AGENT_ENV_CHECKS: ReadonlyArray<
  (env: NodeJS.ProcessEnv) => boolean
> = [
  (env) => !!env["CLAUDE_CODE_CHILD_SESSION"],
  (env) =>
    !!env["CODEX_THREAD_ID"] || !!env["CODEX_CI"] || !!env["CODEX_SANDBOX"],
  (env) =>
    !!env["CURSOR_AGENT"] || env["CURSOR_EXTENSION_HOST_ROLE"] === "agent-exec",
];
