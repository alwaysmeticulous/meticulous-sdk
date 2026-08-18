import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CUSTOMER_AGENT_NAMES } from "../customer-agents";
import { CUSTOMER_DOC_FILES } from "../customer-docs";
import { METICULOUS_DOCS_BASE_URL, METICULOUS_DOCS_HOST } from "../docs-urls";
import { materializeOnboardWorkspace } from "../materialize-workspace";

const dirs: string[] = [];

const makeProjectRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-materialize-"));
  dirs.push(root);
  return root;
};

const materializeInto = (projectRoot: string): string =>
  materializeOnboardWorkspace({
    projectRoot,
    context: {
      orgAndProject: null,
      projectRoot,
      meticulousSideSetupPath: join(
        projectRoot,
        ".meticulous-onboard",
        "meticulous-side-setup.md",
      ),
      repoUrl: null,
      ciProvider: "unknown",
      isGitHubIntegrationActive: null,
      isGitLabIntegrationActive: null,
      isBitbucketIntegrationActive: null,
      meticulousSettingsUrl: null,
      meticulousTokensUrl: null,
      meticulousSessionsUrl: null,
      githubConfigureProjectsUrl: null,
      gitlabConfigureProjectsUrl: null,
      bitbucketConfigureProjectsUrl: null,
      secretsUrl: null,
      secretsUrlLabel: null,
      agentIntegrationPaths: [],
      isMonorepo: false,
      selectedAppPath: ".",
      selectedAppName: "app",
      selectedAppAbsolutePath: projectRoot,
      frameworkDetection: null,
    },
  });

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const canonicalAgentsDir = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "packages",
  "admin-cli",
  "src",
  "cli",
  "onboard",
  "templates",
  "agents",
);

describe("materializeOnboardWorkspace", () => {
  it("copies exactly the customer-safe agents", () => {
    const workspaceDir = materializeInto(makeProjectRoot());

    const copied = readdirSync(join(workspaceDir, ".claude", "agents")).sort();
    expect(copied).toEqual(
      [...CUSTOMER_AGENT_NAMES].sort().map((name) => `${name}.md`),
    );
  });

  it("does not auto-approve Bash in Claude settings", () => {
    const workspaceDir = materializeInto(makeProjectRoot());
    const settings = JSON.parse(
      readFileSync(join(workspaceDir, ".claude", "settings.json"), "utf8"),
    ) as { permissions?: { allow?: string[] } };

    expect(settings.permissions?.allow ?? []).not.toContain("Bash");
  });

  it("pre-approves fetching the public docs, and only from that host", () => {
    const workspaceDir = materializeInto(makeProjectRoot());
    const settings = JSON.parse(
      readFileSync(join(workspaceDir, ".claude", "settings.json"), "utf8"),
    ) as { permissions?: { allow?: string[] } };
    const allow = settings.permissions?.allow ?? [];

    expect(allow).toContain(`WebFetch(domain:${METICULOUS_DOCS_HOST})`);
    // An unscoped WebFetch would let repo-controlled content exfiltrate anywhere.
    expect(allow).not.toContain("WebFetch");
  });

  it("bundles the docs the playbooks cite into .claude/docs", () => {
    const workspaceDir = materializeInto(makeProjectRoot());
    const docsDir = join(workspaceDir, ".claude", "docs");

    for (const docPath of CUSTOMER_DOC_FILES) {
      expect(existsSync(join(docsDir, docPath)), docPath).toBe(true);
    }
    // The recorder snippets are the content a WebFetch of the live docs cannot
    // retrieve (client-rendered), so they must be present on disk.
    const snippets = readdirSync(join(docsDir, "recorder-snippets"));
    expect(snippets).toContain("script-based-instructions");
    expect(snippets).toContain("npm-package-based-instructions");
    expect(
      readFileSync(join(docsDir, "recorder-snippets", "constants.ts"), "utf8"),
    ).toContain("snippet.meticulous.ai");
  });

  it("inlines the GitLab and Bitbucket steps the CI doc imports", () => {
    const workspaceDir = materializeInto(makeProjectRoot());
    const ciDoc = readFileSync(
      join(workspaceDir, ".claude", "docs", "github-actions-v2.ts"),
      "utf8",
    );

    // The docs site interpolates these; left as placeholders the agent has no
    // GitLab/Bitbucket steps at all.
    expect(ciDoc).not.toContain("${linkGitLabInstructions}");
    expect(ciDoc).not.toContain("${linkBitbucketInstructions}");
    expect(ciDoc).toContain("personal access token");
    expect(ciDoc).toContain("repository access token");
    // Imports resolved from webapp-frontend rather than the docs directory.
    expect(ciDoc).not.toContain("${METICULOUS_SUPPORT_EMAIL}");
    expect(ciDoc).toContain("support@meticulous.ai");
  });

  it("tells the agent to read local docs first with a URL fallback", () => {
    const workspaceDir = materializeInto(makeProjectRoot());
    const claudeMd = readFileSync(
      join(workspaceDir, ".claude", "CLAUDE.md"),
      "utf8",
    );

    expect(claudeMd).toContain(".claude/docs/");
    expect(claudeMd).toContain(METICULOUS_DOCS_BASE_URL);
  });

  it("omits internal agents that only exist in the canonical directory", () => {
    const internalAgents = readdirSync(canonicalAgentsDir)
      .filter((file) => file.endsWith(".md"))
      .filter(
        (file) => !CUSTOMER_AGENT_NAMES.includes(file.replace(/\.md$/, "")),
      );
    // Guards the assertion below from silently passing if the canonical set ever
    // becomes entirely customer-safe.
    expect(internalAgents.length).toBeGreaterThan(0);

    const workspaceDir = materializeInto(makeProjectRoot());

    const copied = readdirSync(join(workspaceDir, ".claude", "agents"));
    expect(copied.filter((file) => internalAgents.includes(file))).toEqual([]);
  });
});
