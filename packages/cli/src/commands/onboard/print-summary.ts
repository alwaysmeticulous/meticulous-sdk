import chalk from "chalk";
import type { FrameworkDetection } from "./detect-framework";
import type { OnboardContextJson } from "./materialize-workspace";

/** Prints what the onboard run resolved, before any agent takes over the terminal. */
export const printOnboardSummary = (options: {
  context: OnboardContextJson;
  frameworkDetection: FrameworkDetection;
  projectRoot: string;
  workspaceDir: string;
}): void => {
  const { context, frameworkDetection, projectRoot, workspaceDir } = options;

  console.log("");
  console.log(chalk.bold("Meticulous onboard"));
  console.log(
    `  Project:   ${chalk.green(context.orgAndProject ?? "(unknown — set tokens in the dashboard)")}`,
  );
  const vcsLine = formatVcsLinkLine(context);
  if (vcsLine) {
    console.log(vcsLine);
  }
  console.log(
    `  App:       ${chalk.green(
      `${context.selectedAppName} (${context.selectedAppPath})`,
    )}${context.isMonorepo ? chalk.dim(" [monorepo]") : ""}`,
  );
  console.log(
    `  Framework: ${chalk.green(
      `${frameworkDetection.framework} / ${frameworkDetection.rendering}`,
    )}`,
  );
  console.log(`  Repo:      ${chalk.green(projectRoot)}`);
  console.log(`  Workspace: ${chalk.green(workspaceDir)}`);
  console.log("");
};

const formatVcsLinkLine = (context: OnboardContextJson): string | null => {
  switch (context.ciProvider) {
    case "github-actions":
      return `  GitHub:    ${linkStatus(context.isGitHubIntegrationActive)}`;
    case "gitlab-ci":
      return `  GitLab:    ${linkStatus(context.isGitLabIntegrationActive)}`;
    case "bitbucket-pipelines":
      return `  Bitbucket: ${linkStatus(context.isBitbucketIntegrationActive)}`;
    default:
      return null;
  }
};

const linkStatus = (linked: boolean | null): string => {
  if (linked === true) {
    return chalk.green("linked");
  }
  if (linked === false) {
    return chalk.yellow("not linked");
  }
  return chalk.dim("unknown");
};
