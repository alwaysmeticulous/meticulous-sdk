import type { Project } from "@alwaysmeticulous/api";
import { isInteractiveContext } from "@alwaysmeticulous/client";
import chalk from "chalk";
import inquirer from "inquirer";
import { CliUserError } from "../../utils/cli-user-error";
import { GITHUB_ACTIONS_DOCS_URL } from "./docs-urls";
import type { OnboardContextJson } from "./materialize-workspace";

type LinkedVcs = "github" | "gitlab" | "bitbucket";

const VCS_LABEL: Record<LinkedVcs, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

/**
 * Warns when the Meticulous project is not linked to its VCS host and asks
 * whether to carry on. Linking is not required for the install itself — only
 * for PR/MR status checks — so skipping is always allowed. The host is taken
 * from the local remote, falling back to GitHub when the remote is missing or
 * unrecognised (the GitHub App is the primary integration).
 */
export const confirmVcsLinkIfNeeded = async (options: {
  project: Project | null;
  context: OnboardContextJson;
}): Promise<void> => {
  const { project, context } = options;
  if (!project) {
    return;
  }

  const host = vcsForCiProvider(context.ciProvider) ?? "github";
  const linked = isVcsLinked(context, host);
  if (linked === true) {
    return;
  }

  const configureUrl = configureUrlFor(context, host);
  const projectLabel = context.orgAndProject ?? project.name;

  if (linked === null) {
    console.log(
      chalk.yellow(
        `  Could not confirm whether ${projectLabel} is linked to ${VCS_LABEL[host]}. Continuing.`,
      ),
    );
    if (configureUrl) {
      console.log(
        chalk.dim(
          `  If CI status checks fail later, link the repo here: ${configureUrl}`,
        ),
      );
    }
    return;
  }

  console.log(
    chalk.yellow(
      host === "github"
        ? `  Warning: no Meticulous GitHub App is linked to ${projectLabel}.`
        : `  Warning: ${projectLabel} is not linked to ${VCS_LABEL[host]} yet.`,
    ),
  );
  console.log(
    chalk.dim(
      `  Meticulous cannot post status checks on your ${host === "gitlab" ? "merge" : "pull"} requests until it is linked:`,
    ),
  );
  if (configureUrl) {
    console.log(`  ${chalk.cyan(configureUrl)}`);
  }
  if (!context.repoUrl) {
    console.log(
      chalk.dim(
        "  This repository also has no `origin` remote yet — add one (`git remote add origin <url>`) so the branch can be pushed and the PR opened.",
      ),
    );
  }
  console.log("");

  // Nothing here blocks the install, so a non-interactive run just carries on.
  if (!isInteractiveContext()) {
    return;
  }

  const { skipForNow } = await inquirer.prompt<{ skipForNow: boolean }>([
    {
      type: "confirm",
      name: "skipForNow",
      message: "Skip this for now and continue the install?",
      default: true,
    },
  ]);

  if (!skipForNow) {
    throw new CliUserError(
      [
        `Link ${projectLabel} to ${VCS_LABEL[host]}, then re-run \`meticulous onboard\`.`,
        ...(configureUrl ? [`  ${configureUrl}`] : []),
      ].join("\n"),
    );
  }
};

const vcsForCiProvider = (
  ciProvider: OnboardContextJson["ciProvider"],
): LinkedVcs | null => {
  switch (ciProvider) {
    case "github-actions":
      return "github";
    case "gitlab-ci":
      return "gitlab";
    case "bitbucket-pipelines":
      return "bitbucket";
    default:
      return null;
  }
};

const isVcsLinked = (
  context: OnboardContextJson,
  vcs: LinkedVcs,
): boolean | null => {
  switch (vcs) {
    case "github":
      return context.isGitHubIntegrationActive;
    case "gitlab":
      return context.isGitLabIntegrationActive;
    case "bitbucket":
      return context.isBitbucketIntegrationActive;
  }
};

const configureUrlFor = (
  context: OnboardContextJson,
  vcs: LinkedVcs,
): string | null => {
  switch (vcs) {
    case "github":
      // Point people at the GitHub Actions install guide rather than the
      // org configure-projects UI — that page walks through installing the app.
      return GITHUB_ACTIONS_DOCS_URL;
    case "gitlab":
      return context.gitlabConfigureProjectsUrl;
    case "bitbucket":
      return context.bitbucketConfigureProjectsUrl;
  }
};
