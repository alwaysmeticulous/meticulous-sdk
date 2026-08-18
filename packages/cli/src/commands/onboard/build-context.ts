import { join } from "path";
import type { Project } from "@alwaysmeticulous/api";
import {
  detectCiProvider,
  detectRepoUrl,
  parseGitHubRepo,
} from "./git-repo-info";
import type { FrameworkDetection } from "./detect-framework";
import { discoverFrontendApps, type DiscoveredApp } from "./discover-apps";
import {
  METICULOUS_SIDE_SETUP_FILE,
  ONBOARD_WORKDIR,
  type OnboardContextJson,
} from "./materialize-workspace";

const METICULOUS_APP_URL = "https://app.meticulous.ai";

/**
 * Assembles the onboard-context.json payload handed to the install agent, from
 * the resolved Meticulous project plus locally detected repo/app/framework info.
 */
export const buildOnboardContext = (options: {
  projectRoot: string;
  project: Project | null;
  selectedApp: DiscoveredApp;
  selectedAppAbsolutePath: string;
  frameworkDetection: FrameworkDetection;
}): OnboardContextJson => {
  const repoUrl = detectRepoUrl(options.projectRoot);
  const ciProvider = detectCiProvider(repoUrl);
  const project = options.project;

  const organizationName = project?.organization.name ?? null;
  const projectName = project?.name ?? null;
  const orgAndProject =
    organizationName && projectName
      ? `${organizationName}/${projectName}`
      : null;

  const urls = buildDashboardUrls({ organizationName, projectName });
  const secrets = buildSecretsLocation({ ciProvider, repoUrl });

  const discovered = discoverFrontendApps(options.projectRoot);
  const isMonorepo = discovered.length > 1;

  return {
    orgAndProject,
    projectRoot: options.projectRoot,
    meticulousSideSetupPath: join(
      options.projectRoot,
      ONBOARD_WORKDIR,
      METICULOUS_SIDE_SETUP_FILE,
    ),
    repoUrl,
    ciProvider,
    isGitHubIntegrationActive: optionalBool(project?.isGitHubIntegrationActive),
    isGitLabIntegrationActive: optionalBool(project?.isGitLabIntegrationActive),
    isBitbucketIntegrationActive: optionalBool(
      project?.isBitbucketIntegrationActive,
    ),
    meticulousSettingsUrl: urls.meticulousSettingsUrl,
    meticulousTokensUrl: urls.meticulousTokensUrl,
    meticulousSessionsUrl: urls.meticulousSessionsUrl,
    githubConfigureProjectsUrl: urls.githubConfigureProjectsUrl,
    gitlabConfigureProjectsUrl: urls.gitlabConfigureProjectsUrl,
    bitbucketConfigureProjectsUrl: urls.bitbucketConfigureProjectsUrl,
    secretsUrl: secrets.secretsUrl,
    secretsUrlLabel: secrets.secretsUrlLabel,
    agentIntegrationPaths: [],
    isMonorepo,
    selectedAppPath: options.selectedApp.path,
    selectedAppName: options.selectedApp.name,
    selectedAppAbsolutePath: options.selectedAppAbsolutePath,
    frameworkDetection: options.frameworkDetection,
  };
};

const optionalBool = (value: boolean | undefined): boolean | null =>
  value === undefined ? null : value;

const buildDashboardUrls = (options: {
  organizationName: string | null;
  projectName: string | null;
}): Pick<
  OnboardContextJson,
  | "meticulousSettingsUrl"
  | "meticulousTokensUrl"
  | "meticulousSessionsUrl"
  | "githubConfigureProjectsUrl"
  | "gitlabConfigureProjectsUrl"
  | "bitbucketConfigureProjectsUrl"
> => {
  const { organizationName, projectName } = options;
  const projectPath =
    organizationName && projectName
      ? `${METICULOUS_APP_URL}/projects/${encodeURIComponent(organizationName)}/${encodeURIComponent(projectName)}`
      : null;

  const orgPath = organizationName
    ? `${METICULOUS_APP_URL}/organizations/${encodeURIComponent(organizationName)}`
    : null;

  return {
    meticulousSettingsUrl: projectPath ? `${projectPath}?tab=settings` : null,
    meticulousTokensUrl: projectPath
      ? `${projectPath}?tab=settings&section=tokens`
      : null,
    meticulousSessionsUrl: projectPath ? `${projectPath}?tab=sessions` : null,
    githubConfigureProjectsUrl: orgPath
      ? `${orgPath}/integrations/github/configure-projects`
      : null,
    // GitLab / Bitbucket tokens are entered under Project settings → CI → Linked repository.
    gitlabConfigureProjectsUrl: projectPath
      ? `${projectPath}?tab=settings&section=ci`
      : null,
    bitbucketConfigureProjectsUrl: projectPath
      ? `${projectPath}?tab=settings&section=ci`
      : null,
  };
};

const buildSecretsLocation = (options: {
  ciProvider: OnboardContextJson["ciProvider"];
  repoUrl: string | null;
}): Pick<OnboardContextJson, "secretsUrl" | "secretsUrlLabel"> => {
  const { ciProvider, repoUrl } = options;

  if (ciProvider === "github-actions" && repoUrl) {
    const gh = parseGitHubRepo(repoUrl);
    if (gh) {
      return {
        secretsUrl: `https://github.com/${gh.owner}/${gh.repo}/settings/secrets/actions`,
        secretsUrlLabel: "GitHub Actions secrets",
      };
    }
  }
  if (ciProvider === "gitlab-ci") {
    return { secretsUrl: null, secretsUrlLabel: "GitLab CI/CD variables" };
  }
  if (ciProvider === "bitbucket-pipelines") {
    return {
      secretsUrl: null,
      secretsUrlLabel: "Bitbucket repository variables",
    };
  }
  return { secretsUrl: null, secretsUrlLabel: null };
};
