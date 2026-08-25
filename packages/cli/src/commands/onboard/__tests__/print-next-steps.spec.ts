import { afterEach, describe, expect, it, vi } from "vitest";
import { printNextSteps } from "../launch-agent";

const baseContext = {
  orgAndProject: "acme/web app",
  meticulousSideSetupPath: "/tmp/missing-setup.md",
  meticulousTokensUrl:
    "https://app.meticulous.ai/projects/acme/web%20app?tab=settings&section=tokens",
  meticulousSessionsUrl:
    "https://app.meticulous.ai/projects/acme/web%20app?tab=sessions",
  secretsUrl: "https://github.com/acme/web/settings/secrets/actions",
  secretsUrlLabel: "GitHub Actions secrets",
  githubConfigureProjectsUrl: null,
  gitlabConfigureProjectsUrl: null,
  bitbucketConfigureProjectsUrl: null,
  isGitHubIntegrationActive: true,
  isGitLabIntegrationActive: null,
  isBitbucketIntegrationActive: null,
  ciProvider: "github-actions" as const,
};

describe("printNextSteps", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells the user to click around locally and confirm a session appears", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printNextSteps({ tool: "claude", context: baseContext });

    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain(
      "start your local app with the recording token set",
    );
    expect(output).toContain("click around");
    expect(output).toContain(baseContext.meticulousSessionsUrl);
    expect(output).toContain(baseContext.secretsUrl);
    expect(output).not.toContain("simulate");
  });

  it("prints the whole tokens url on both token steps", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printNextSteps({ tool: "claude", context: baseContext });

    const output = stripAnsi(log.mock.calls.flat().join("\n"));
    const tokenSteps = output
      .split("\n")
      .filter((line) => line.includes("token from"));
    expect(tokenSteps).toHaveLength(2);
    for (const step of tokenSteps) {
      expect(step).toContain(`from ${baseContext.meticulousTokensUrl} and`);
    }
  });

  it("still points at a full url when the project is unknown", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printNextSteps({
      tool: "claude",
      context: {
        ...baseContext,
        orgAndProject: null,
        meticulousTokensUrl: null,
        meticulousSessionsUrl: null,
      },
    });

    const output = stripAnsi(log.mock.calls.flat().join("\n"));
    expect(output).toContain(
      "https://app.meticulous.ai (your project → Settings → Tokens)",
    );
    expect(output).toContain(
      "https://app.meticulous.ai (your project → Sessions)",
    );
  });
});

const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");

const stripAnsi = (value: string): string => value.replace(ANSI_COLOR, "");
