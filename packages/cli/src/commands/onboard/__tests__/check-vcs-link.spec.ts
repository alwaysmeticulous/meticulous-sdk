import type { Project } from "@alwaysmeticulous/api";
import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { confirmVcsLinkIfNeeded } from "../check-vcs-link";
import { GITHUB_ACTIONS_DOCS_URL } from "../docs-urls";
import type { OnboardContextJson } from "../materialize-workspace";

const isInteractive = vi.fn(() => false);
const promptForConfirmation = vi.fn();

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  isInteractiveContext: () => isInteractive(),
}));

vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptForConfirmation(...args) },
}));

const baseContext = (
  overrides: Partial<OnboardContextJson> = {},
): OnboardContextJson => ({
  orgAndProject: "acme/web",
  projectRoot: "/tmp/web",
  meticulousSideSetupPath:
    "/tmp/web/.meticulous-onboard/meticulous-side-setup.md",
  repoUrl: "git@github.com:acme/web.git",
  ciProvider: "github-actions",
  isGitHubIntegrationActive: false,
  isGitLabIntegrationActive: null,
  isBitbucketIntegrationActive: null,
  meticulousSettingsUrl: null,
  meticulousTokensUrl: null,
  meticulousSessionsUrl: null,
  githubConfigureProjectsUrl:
    "https://app.meticulous.ai/organizations/acme/integrations/github/configure-projects",
  gitlabConfigureProjectsUrl:
    "https://app.meticulous.ai/projects/acme/web?tab=settings&section=ci",
  bitbucketConfigureProjectsUrl:
    "https://app.meticulous.ai/projects/acme/web?tab=settings&section=ci",
  secretsUrl: null,
  secretsUrlLabel: null,
  agentIntegrationPaths: [],
  isMonorepo: false,
  selectedAppPath: ".",
  selectedAppName: "web",
  selectedAppAbsolutePath: "/tmp/web",
  frameworkDetection: null,
  ...overrides,
});

const project = { name: "web" } as Project;

let log: MockInstance<typeof console.log>;
const logged = (): string =>
  log.mock.calls.map((call) => String(call[0])).join("\n");

beforeEach(() => {
  isInteractive.mockReturnValue(false);
  promptForConfirmation.mockReset();
  log = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("confirmVcsLinkIfNeeded", () => {
  it("is silent when GitHub is already linked", async () => {
    await confirmVcsLinkIfNeeded({
      project,
      context: baseContext({ isGitHubIntegrationActive: true }),
    });
    expect(log).not.toHaveBeenCalled();
    expect(promptForConfirmation).not.toHaveBeenCalled();
  });

  it("warns about the missing GitHub App and links the Actions docs", async () => {
    await confirmVcsLinkIfNeeded({
      project,
      context: baseContext({ isGitHubIntegrationActive: false }),
    });
    expect(logged()).toContain("no Meticulous GitHub App is linked");
    expect(logged()).toContain(GITHUB_ACTIONS_DOCS_URL);
  });

  it("continues without prompting when there is no terminal", async () => {
    await confirmVcsLinkIfNeeded({
      project,
      context: baseContext({ isGitHubIntegrationActive: false }),
    });
    expect(promptForConfirmation).not.toHaveBeenCalled();
  });

  it("offers to skip the link for now and continues when accepted", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ skipForNow: true });

    await expect(
      confirmVcsLinkIfNeeded({
        project,
        context: baseContext({ isGitHubIntegrationActive: false }),
      }),
    ).resolves.toBeUndefined();
    expect(promptForConfirmation).toHaveBeenCalledWith([
      expect.objectContaining({
        message: "Skip this for now and continue the install?",
        default: true,
      }),
    ]);
  });

  it("stops with the link when the user declines to skip", async () => {
    isInteractive.mockReturnValue(true);
    promptForConfirmation.mockResolvedValue({ skipForNow: false });

    await expect(
      confirmVcsLinkIfNeeded({
        project,
        context: baseContext({ isGitHubIntegrationActive: false }),
      }),
    ).rejects.toThrow(CliUserError);
  });

  it("warns about an unlinked GitLab project with the project settings URL", async () => {
    await confirmVcsLinkIfNeeded({
      project,
      context: baseContext({
        ciProvider: "gitlab-ci",
        repoUrl: "git@gitlab.com:acme/web.git",
        isGitHubIntegrationActive: null,
        isGitLabIntegrationActive: false,
      }),
    });
    expect(logged()).toContain("not linked to GitLab");
    expect(logged()).toContain("merge requests");
    expect(logged()).toContain(
      "https://app.meticulous.ai/projects/acme/web?tab=settings&section=ci",
    );
  });

  it("warns about an unlinked Bitbucket project", async () => {
    await confirmVcsLinkIfNeeded({
      project,
      context: baseContext({
        ciProvider: "bitbucket-pipelines",
        repoUrl: "git@bitbucket.org:acme/web.git",
        isGitHubIntegrationActive: null,
        isBitbucketIntegrationActive: false,
      }),
    });
    expect(logged()).toContain("not linked to Bitbucket");
  });

  it("falls back to the GitHub App warning when there is no remote, and flags the missing remote", async () => {
    await expect(
      confirmVcsLinkIfNeeded({
        project,
        context: baseContext({
          ciProvider: "unknown",
          repoUrl: null,
          isGitHubIntegrationActive: false,
        }),
      }),
    ).resolves.toBeUndefined();
    expect(logged()).toContain("no Meticulous GitHub App is linked");
    expect(logged()).toContain(GITHUB_ACTIONS_DOCS_URL);
    expect(logged()).toContain("no `origin` remote");
  });

  it("falls back to the GitHub App warning for a remote on an unrecognised host", async () => {
    await expect(
      confirmVcsLinkIfNeeded({
        project,
        context: baseContext({
          ciProvider: "unknown",
          repoUrl: "git@git.internal.acme.dev:acme/web.git",
          isGitHubIntegrationActive: false,
        }),
      }),
    ).resolves.toBeUndefined();
    expect(logged()).toContain("no Meticulous GitHub App is linked");
    expect(logged()).toContain(GITHUB_ACTIONS_DOCS_URL);
  });

  it("stays silent for an unrecognised host once GitHub is linked", async () => {
    await confirmVcsLinkIfNeeded({
      project,
      context: baseContext({
        ciProvider: "unknown",
        repoUrl: "git@git.internal.acme.dev:acme/web.git",
        isGitHubIntegrationActive: true,
      }),
    });
    expect(log).not.toHaveBeenCalled();
  });
});
