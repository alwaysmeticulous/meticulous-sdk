import {
  CLI_LOGIN_INTENT_ONBOARD,
  SelfOnboardError,
  createClient,
  getValidAccessToken,
  isInteractiveContext,
  performOAuthLogin,
  selfOnboard,
  type SelfOnboardResponse,
} from "@alwaysmeticulous/client";
import { CliUserError } from "../../../utils/cli-user-error";
import { CLI_COMMAND } from "../shared/cli-command";
import { MAX_PROJECT_NAME_LENGTH } from "./repo-facts";

/**
 * Self-onboarded organizations are capped at 25 projects server-side, so after
 * this many distinct names either one was free (and got created) or the
 * backend's project-limit-reached error already surfaced.
 */
const MAX_NEW_PROJECT_NAME_ATTEMPTS = 26;

/**
 * Signs the user in (browser OAuth, onboarding variant of the login page) and
 * creates — or, on a re-run, returns — their trial organization and project.
 * With `forceNewProject` a brand-new project is created instead of reusing one
 * with the same name. Always uses the OAuth login, never METICULOUS_API_TOKEN:
 * self-onboarding is an account-level action and a project token may belong to
 * another project.
 */
export const selfOnboardProject = async (
  projectName: string,
  options: { forceNewProject?: boolean } = {},
): Promise<SelfOnboardResponse> => {
  const accessToken = await ensureOAuthAccessToken();
  const client = createClient({ apiToken: accessToken });
  try {
    return options.forceNewProject
      ? await selfOnboardNewProject(projectName, (name) =>
          selfOnboard(client, { projectName: name }),
        )
      : await selfOnboard(client, { projectName });
  } catch (error) {
    throw error instanceof SelfOnboardError ? toCliUserError(error) : error;
  }
};

/**
 * The self-onboard endpoint returns the existing project when the name is
 * already taken, so to force a new one walk `name`, `name-2`, `name-3`, …
 * until the response says it was created.
 */
export const selfOnboardNewProject = async (
  baseName: string,
  onboard: (projectName: string) => Promise<SelfOnboardResponse>,
): Promise<SelfOnboardResponse> => {
  for (let attempt = 1; attempt <= MAX_NEW_PROJECT_NAME_ATTEMPTS; attempt++) {
    const response = await onboard(nthProjectName(baseName, attempt));
    if (response.created) {
      return response;
    }
  }
  throw new CliUserError(
    "Could not create a new trial project: every candidate project name is already taken. " +
      "Contact support@meticulous.ai.",
  );
};

export const nthProjectName = (baseName: string, attempt: number): string => {
  if (attempt === 1) {
    return baseName;
  }
  const suffix = `-${attempt}`;
  // Trim the base rather than the suffix, so every attempt stays distinct
  // after the backend truncates to its own name-length cap.
  return `${baseName.slice(0, MAX_PROJECT_NAME_LENGTH - suffix.length)}${suffix}`;
};

const ensureOAuthAccessToken = async (): Promise<string> => {
  const existing = await getValidAccessToken();
  if (existing) {
    return existing;
  }
  if (!isInteractiveContext()) {
    throw new CliUserError(
      `\`${CLI_COMMAND} try\` needs you to be logged in to Meticulous. Run it in an interactive terminal ` +
        `so it can open a browser, or run \`${CLI_COMMAND} auth login --device\` first on a remote machine.`,
    );
  }
  console.log("Opening the browser to sign in to Meticulous…");
  const tokens = await performOAuthLogin({ intent: CLI_LOGIN_INTENT_ONBOARD });
  return tokens.accessToken;
};

const toCliUserError = (error: SelfOnboardError): CliUserError => {
  switch (error.kind) {
    case "rate-limited":
      return new CliUserError(
        `Could not create a trial project: ${error.message}`,
      );
    case "project-limit-reached":
      return new CliUserError(
        `Could not create a trial project: ${error.message}\n` +
          `Re-run \`${CLI_COMMAND} try\` in a repo you already tried to reuse its project, or contact support@meticulous.ai.`,
      );
    case "not-logged-in":
      return new CliUserError(error.message);
    case "forbidden":
      return new CliUserError(
        `Could not create a trial project: ${error.message}\n` +
          "Contact support@meticulous.ai if you think this is a mistake.",
      );
    case "unsupported":
      return new CliUserError(
        `${error.message} Update the CLI (\`npm install -g @alwaysmeticulous/cli@latest\`) or contact support@meticulous.ai.`,
      );
    case "unknown":
      return new CliUserError(
        `Could not create a trial project: ${error.message}`,
      );
    default: {
      const unexpected: never = error.kind;
      return new CliUserError(
        `Could not create a trial project (${String(unexpected)}).`,
      );
    }
  }
};
