import type { AgentTraceEnvironment } from "../types/constants";

export interface DetectedEnvironment {
  /** An `AgentTraceEnvironment`, or whatever the override names. */
  environment: string;
  environmentId: string | null;
}

export const ENVIRONMENT_ENV_VAR = "METICULOUS_AGENT_TRACES_ENVIRONMENT";
export const ENVIRONMENT_ID_ENV_VAR = "METICULOUS_AGENT_TRACES_ENVIRONMENT_ID";

/**
 * Where this upload runs. A hook-triggered upload inherits the cloud agent's
 * environment, and a cloud VM only holds that product's sessions, so this
 * describes every session the run uploads. Products that don't identify
 * themselves (e.g. Devin) can set the override in their cloud-only config.
 */
export const detectEnvironment = (
  env: NodeJS.ProcessEnv,
): DetectedEnvironment => {
  const override = env[ENVIRONMENT_ENV_VAR]?.trim();
  if (override) {
    return {
      environment: override,
      environmentId: env[ENVIRONMENT_ID_ENV_VAR]?.trim() || null,
    };
  }
  if (env["CLAUDE_CODE_REMOTE"] === "true") {
    return detected("claude-code-web", env["CLAUDE_CODE_REMOTE_SESSION_ID"]);
  }
  if (env["CONDUCTOR_WORKSPACE_ID"]) {
    return detected(
      env["CONDUCTOR_IS_LOCAL"] === "0" ? "conductor-cloud" : "conductor-local",
      env["CONDUCTOR_WORKSPACE_ID"],
    );
  }
  // Cursor exposes the cloud agent's id only through this socket's API.
  if (env["CURSOR_AGENT_SOCKET"]) {
    return detected("cursor-cloud", undefined);
  }
  if (env["GITHUB_ACTIONS"] === "true") {
    return detected("github-actions", env["GITHUB_RUN_ID"]);
  }
  if (env["CI"] && env["CI"] !== "false" && env["CI"] !== "0") {
    return detected("ci", undefined);
  }
  return detected("local", undefined);
};

const detected = (
  environment: AgentTraceEnvironment,
  environmentId: string | undefined,
): DetectedEnvironment => ({
  environment,
  environmentId: environmentId || null,
});
