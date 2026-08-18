import { execSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { Project } from "@alwaysmeticulous/api";
import { afterEach, describe, expect, it } from "vitest";
import { buildOnboardContext } from "../build-context";
import type { FrameworkDetection } from "../detect-framework";
import type { DiscoveredApp } from "../discover-apps";

const dirs: string[] = [];

const makeRepo = (options: {
  files?: Record<string, string>;
  remoteUrl?: string;
}): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-context-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(options.files ?? {})) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  execSync("git init -q", { cwd: root, stdio: "ignore" });
  if (options.remoteUrl) {
    execSync(`git remote add origin ${options.remoteUrl}`, {
      cwd: root,
      stdio: "ignore",
    });
  }
  return root;
};

const meticulousProject = (overrides: Partial<Project> = {}): Project => ({
  id: "project-id",
  name: "web",
  organization: {
    id: "org-id",
    name: "acme",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  },
  recordingToken: "token",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  isMonitoringEnabled: true,
  settings: {},
  experimentValues: {},
  ...overrides,
});

const SELECTED_APP: DiscoveredApp = {
  path: ".",
  name: "web",
  packageName: "web",
};

const FRAMEWORK_DETECTION: FrameworkDetection = {
  framework: "react-spa",
  rendering: "csr",
  isUnsupportedSsr: false,
  unsupportedSsrConfidence: null,
  details: ["React SPA detected"],
};

const buildContextFor = (options: {
  projectRoot: string;
  project?: Project | null;
  selectedApp?: DiscoveredApp;
}) =>
  buildOnboardContext({
    projectRoot: options.projectRoot,
    project: options.project ?? null,
    selectedApp: options.selectedApp ?? SELECTED_APP,
    selectedAppAbsolutePath: options.projectRoot,
    frameworkDetection: FRAMEWORK_DETECTION,
  });

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildOnboardContext", () => {
  it("builds dashboard and GitHub secrets urls for a GitHub repo", () => {
    const projectRoot = makeRepo({
      remoteUrl: "git@github.com:acme/web.git",
    });

    const context = buildContextFor({
      projectRoot,
      project: meticulousProject({ isGitHubIntegrationActive: true }),
    });

    expect(context).toMatchObject({
      orgAndProject: "acme/web",
      ciProvider: "github-actions",
      isGitHubIntegrationActive: true,
      meticulousSettingsUrl:
        "https://app.meticulous.ai/projects/acme/web?tab=settings",
      meticulousTokensUrl:
        "https://app.meticulous.ai/projects/acme/web?tab=settings&section=tokens",
      meticulousSessionsUrl:
        "https://app.meticulous.ai/projects/acme/web?tab=sessions",
      githubConfigureProjectsUrl:
        "https://app.meticulous.ai/organizations/acme/integrations/github/configure-projects",
      secretsUrl: "https://github.com/acme/web/settings/secrets/actions",
      secretsUrlLabel: "GitHub Actions secrets",
    });
  });

  it("url-encodes organization and project names", () => {
    const projectRoot = makeRepo({});

    const context = buildContextFor({
      projectRoot,
      project: meticulousProject({ name: "web app" }),
    });

    expect(context.meticulousSettingsUrl).toBe(
      "https://app.meticulous.ai/projects/acme/web%20app?tab=settings",
    );
  });

  it("labels GitLab CI variables without a secrets url", () => {
    const projectRoot = makeRepo({
      remoteUrl: "git@gitlab.com:acme/web.git",
    });

    const context = buildContextFor({
      projectRoot,
      project: meticulousProject({ isGitLabIntegrationActive: true }),
    });

    expect(context.ciProvider).toBe("gitlab-ci");
    expect(context.isGitLabIntegrationActive).toBe(true);
    expect(context.secretsUrl).toBeNull();
    expect(context.secretsUrlLabel).toBe("GitLab CI/CD variables");
    expect(context.gitlabConfigureProjectsUrl).toBe(
      "https://app.meticulous.ai/projects/acme/web?tab=settings&section=ci",
    );
  });

  it("labels Bitbucket variables and points at project settings", () => {
    const projectRoot = makeRepo({
      remoteUrl: "git@bitbucket.org:acme/web.git",
    });

    const context = buildContextFor({
      projectRoot,
      project: meticulousProject({ isBitbucketIntegrationActive: false }),
    });

    expect(context.ciProvider).toBe("bitbucket-pipelines");
    expect(context.isBitbucketIntegrationActive).toBe(false);
    expect(context.secretsUrlLabel).toBe("Bitbucket repository variables");
    expect(context.bitbucketConfigureProjectsUrl).toBe(
      "https://app.meticulous.ai/projects/acme/web?tab=settings&section=ci",
    );
  });

  it("leaves project-derived fields null when no project resolved", () => {
    const projectRoot = makeRepo({
      remoteUrl: "git@github.com:acme/web.git",
    });

    const context = buildContextFor({ projectRoot });

    expect(context.orgAndProject).toBeNull();
    expect(context.isGitHubIntegrationActive).toBeNull();
    expect(context.isGitLabIntegrationActive).toBeNull();
    expect(context.isBitbucketIntegrationActive).toBeNull();
    expect(context.meticulousTokensUrl).toBeNull();
    expect(context.githubConfigureProjectsUrl).toBeNull();
    expect(context.gitlabConfigureProjectsUrl).toBeNull();
    expect(context.bitbucketConfigureProjectsUrl).toBeNull();
  });

  it("gives an absolute path for the Meticulous-side setup file", () => {
    const projectRoot = makeRepo({});

    const context = buildContextFor({ projectRoot });

    // The agent's cwd is the onboard workspace rather than the repo, so a
    // relative path would land somewhere neither it nor the user looks.
    expect(context.meticulousSideSetupPath).toBe(
      join(projectRoot, ".meticulous-onboard", "meticulous-side-setup.md"),
    );
  });

  it("flags monorepos with several frontend apps", () => {
    const projectRoot = makeRepo({
      files: {
        "package.json": JSON.stringify({
          name: "root",
          private: true,
          workspaces: ["apps/*"],
        }),
        "apps/web/package.json": JSON.stringify({
          name: "web",
          dependencies: { react: "18.0.0" },
          scripts: { dev: "vite" },
        }),
        "apps/admin/package.json": JSON.stringify({
          name: "admin",
          dependencies: { react: "18.0.0" },
          scripts: { dev: "vite" },
        }),
      },
    });

    const context = buildContextFor({
      projectRoot,
      selectedApp: { path: "apps/web", name: "web", packageName: "web" },
    });

    expect(context.isMonorepo).toBe(true);
    expect(context.selectedAppPath).toBe("apps/web");
    expect(context.selectedAppName).toBe("web");
    expect(context.frameworkDetection).toEqual(FRAMEWORK_DETECTION);
    expect(context.agentIntegrationPaths).toEqual([]);
  });
});
