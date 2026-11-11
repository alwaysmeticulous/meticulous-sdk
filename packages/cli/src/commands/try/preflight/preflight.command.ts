import {
  createClient,
  getProject,
  getStoredOAuthTokens,
  isOAuthJwt,
  resolveAuthToken,
} from "@alwaysmeticulous/client";
import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
} from "../shared/helper-options";
import { CLI_COMMAND } from "../shared/cli-command";
import { readTryContext, type TryContextJson } from "../shared/try-context";
import { shellQuote } from "../shared/agent-env-script";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";
import { findAgentEnvProblems } from "./find-agent-env-problems";

interface Options {
  cwd: string | undefined;
  json: boolean;
}

/**
 * Checks, from the agent's own shell, that a plain `meticulous …` command
 * authenticates with the trial project's token on the trial's backend. The
 * launcher sets that environment up, but a shell profile that exports
 * METICULOUS_* variables, or an OAuth login in the data dir, would override it
 * and send uploads to another project — e.g. a second trial running at once.
 */
const handler = async (options: Options): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  const context = readTryContext(repoRoot);
  if (!context) {
    throw new CliUserError(
      `No trial workspace here. Run \`${CLI_COMMAND} try\` first.`,
    );
  }
  const problems = findAgentEnvProblems({
    context,
    env: process.env,
    dataDir: getMeticulousLocalDataDir(),
    oauthLoginStored: getStoredOAuthTokens() != null,
  });
  if (problems.length === 0) {
    problems.push(...(await findResolvedAuthProblems(context)));
  }

  const projectLabel = `${context.organization.name}/${context.project.name}`;
  const fixCommand = `. ${shellQuote(absoluteTryPath(repoRoot, TRY_PATHS.agentEnvScript))}`;
  printResult(
    options.json,
    { ok: problems.length === 0, project: projectLabel, problems, fixCommand },
    () =>
      problems.length === 0
        ? [`OK: \`meticulous\` commands in this shell target ${projectLabel}.`]
        : [],
  );
  if (problems.length > 0) {
    throw new CliUserError(
      [
        `\`meticulous\` commands in this shell would not target the trial project ${projectLabel}:`,
        ...problems.map((problem) => `  - ${problem}`),
        `Prefix every \`meticulous\` command with \`${fixCommand} && \` (it restores the trial's environment ` +
          `without printing the token), and re-run \`${fixCommand} && ${CLI_COMMAND} try preflight\` to confirm.`,
      ].join("\n"),
    );
  }
};

const findResolvedAuthProblems = async (
  context: TryContextJson,
): Promise<string[]> => {
  const { token } = await resolveAuthToken(null);
  if (token !== context.apiToken) {
    return [
      token && isOAuthJwt(token)
        ? "Commands would authenticate with an OAuth login instead of the trial project's token."
        : "Commands would not authenticate with the trial project's token.",
    ];
  }
  const project = await getProject(createClient({ apiToken: token }));
  if (project?.id !== context.project.id) {
    return [
      "The backend did not report the trial project for its token: check METICULOUS_API_URL.",
    ];
  }
  return [];
};

export const preflightCommand: CommandModule<unknown, Options> = {
  command: "preflight",
  describe:
    "Check that `meticulous` commands in this shell target the trial project (its token, no OAuth login, the trial's endpoints). Run it before any cloud step",
  builder: HELPER_OPTIONS,
  handler: wrapHandler(handler),
};
