import {
  TRY_ENDPOINT_ENV_VARS,
  readEndpointsFromEnv,
} from "../shared/try-agent-env";
import type { TryContextJson, TryEndpoints } from "../shared/try-context";

/**
 * What in this shell would send the agent's `meticulous …` commands somewhere
 * other than the trial project. Never includes a token's value.
 */
export const findAgentEnvProblems = (options: {
  context: Pick<TryContextJson, "apiToken" | "endpoints">;
  env: NodeJS.ProcessEnv;
  dataDir: string;
  oauthLoginStored: boolean;
}): string[] => {
  const { context, env } = options;
  const problems: string[] = [];
  if (env["METICULOUS_API_TOKEN"] !== context.apiToken) {
    problems.push(
      env["METICULOUS_API_TOKEN"]
        ? "METICULOUS_API_TOKEN is set to a token other than the trial project's."
        : "METICULOUS_API_TOKEN is not set.",
    );
  }
  if (options.oauthLoginStored) {
    problems.push(
      `An OAuth login is stored in ${options.dataDir}. It takes precedence over METICULOUS_API_TOKEN ` +
        "and targets the account-wide default project, which may be another trial's.",
    );
  }
  const actual = readEndpointsFromEnv(env);
  for (const key of Object.keys(TRY_ENDPOINT_ENV_VARS) as Array<
    keyof TryEndpoints
  >) {
    if (actual[key] !== context.endpoints[key]) {
      problems.push(
        `${TRY_ENDPOINT_ENV_VARS[key]} is ${describe(actual[key])}, but the trial project was created with ${describe(context.endpoints[key])}.`,
      );
    }
  }
  return problems;
};

const describe = (value: string | null): string =>
  value ? `'${value}'` : "unset (the default)";
