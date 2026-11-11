import type { TryContextJson, TryEndpoints } from "./try-context";

/** The variables that decide which Meticulous backend and snippets the CLI uses. */
export const TRY_ENDPOINT_ENV_VARS = {
  apiUrl: "METICULOUS_API_URL",
  snippetsBaseUrl: "METICULOUS_SNIPPETS_BASE_URL",
} as const satisfies Record<keyof TryEndpoints, string>;

export const readEndpointsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): TryEndpoints => ({
  apiUrl: env[TRY_ENDPOINT_ENV_VARS.apiUrl] || null,
  snippetsBaseUrl: env[TRY_ENDPOINT_ENV_VARS.snippetsBaseUrl] || null,
});

/**
 * The agent's environment, minus the token: its own data dir (so the user's
 * OAuth login, whose project is the account-wide default, is never found) and
 * the endpoints the trial project lives on. An empty value counts as unset
 * everywhere the CLI reads these, so it pins the built-in default. Not secret,
 * so it can also go into the workspace's Claude Code settings.
 */
export const buildTryAgentPinnedEnv = (options: {
  agentDataDir: string;
  endpoints: TryEndpoints;
}): Record<string, string> => ({
  METICULOUS_DIR: options.agentDataDir,
  [TRY_ENDPOINT_ENV_VARS.apiUrl]: options.endpoints.apiUrl ?? "",
  [TRY_ENDPOINT_ENV_VARS.snippetsBaseUrl]:
    options.endpoints.snippetsBaseUrl ?? "",
});

export const buildTryAgentEnv = (
  context: Pick<TryContextJson, "apiToken" | "endpoints"> & {
    paths: Pick<TryContextJson["paths"], "agentDataDir">;
  },
): Record<string, string> => ({
  ...buildTryAgentPinnedEnv({
    agentDataDir: context.paths.agentDataDir,
    endpoints: context.endpoints,
  }),
  METICULOUS_API_TOKEN: context.apiToken,
});
