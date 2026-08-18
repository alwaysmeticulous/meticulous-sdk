import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { CUSTOMER_AGENT_NAMES } from "./customer-agents";
import { CUSTOMER_DOC_DIRS, CUSTOMER_DOC_FILES } from "./customer-docs";
import { inlineImportedDocConstants } from "./inline-doc-constants";
import {
  assertWorkspaceInsideProject,
  copyFileSafeSync,
  mkdirSafeSync,
  resolveSafeWritePath,
  writeFileSafeSync,
} from "./safe-repo-fs";

export const ONBOARD_WORKDIR = ".meticulous-onboard";

/**
 * Written by the install agent (not the CLI) when something needs setup on the
 * Meticulous side, e.g. WebSocket support. The customer sends it back to us.
 */
export const METICULOUS_SIDE_SETUP_FILE = "meticulous-side-setup.md";

export interface OnboardContextJson {
  orgAndProject: string | null;
  projectRoot: string;
  /**
   * Absolute path the agent must use for METICULOUS_SIDE_SETUP_FILE. The agent
   * runs with the onboard workspace as its cwd rather than the repo, so a
   * relative path lands somewhere neither it nor the user expects.
   */
  meticulousSideSetupPath: string;
  repoUrl: string | null;
  ciProvider:
    | "github-actions"
    | "gitlab-ci"
    | "bitbucket-pipelines"
    | "unknown";
  isGitHubIntegrationActive: boolean | null;
  isGitLabIntegrationActive: boolean | null;
  isBitbucketIntegrationActive: boolean | null;
  meticulousSettingsUrl: string | null;
  /** Recording token + project API token live on this Tokens settings page. */
  meticulousTokensUrl: string | null;
  meticulousSessionsUrl: string | null;
  /** Org page to link/map the GitHub repo to this Meticulous project. */
  githubConfigureProjectsUrl: string | null;
  /** Project settings page where the GitLab access token is entered. */
  gitlabConfigureProjectsUrl: string | null;
  /** Project settings page where the Bitbucket access token is entered. */
  bitbucketConfigureProjectsUrl: string | null;
  secretsUrl: string | null;
  secretsUrlLabel: string | null;
  /**
   * Repo-relative paths the CLI installed for skills/MCP. The agent MUST stage
   * and commit these in the onboarding PR (when they exist).
   */
  agentIntegrationPaths: string[];
  /** Whether the repo is a monorepo with multiple frontend apps. */
  isMonorepo: boolean;
  /** Repo-relative path of the selected frontend app (`.` if single-package). */
  selectedAppPath: string;
  selectedAppName: string;
  selectedAppAbsolutePath: string;
  frameworkDetection: {
    framework: string;
    rendering: string;
    isUnsupportedSsr: boolean;
    /** `"high"` or `"ambiguous"`; null unless `isUnsupportedSsr` is true. */
    unsupportedSsrConfidence: string | null;
    details: string[];
  } | null;
}

const templatesDir = (): string => join(__dirname, "templates");

const agentsDir = (): string => {
  const bundled = join(templatesDir(), "agents");
  // Prefer the postbuild-copied agents only when they actually contain files —
  // an empty `templates/agents/` directory (e.g. from a partial local setup)
  // must not block the source-mode fallback.
  if (
    existsSync(bundled) &&
    readdirSync(bundled).some((file) => file.endsWith(".md"))
  ) {
    return bundled;
  }

  // Source-mode fallback (`pnpm cli:dev`), which reads the canonical agents
  // directly. That directory also holds internal-only agents, so the copy below
  // is driven by CUSTOMER_AGENT_NAMES rather than by its contents. Published
  // builds get the same subset pre-filtered into dist by
  // scripts/copy-onboard-templates.mjs.
  return join(
    __dirname,
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
};

const webappFrontendDir = (): string =>
  join(__dirname, "..", "..", "..", "..", "..", "packages", "webapp-frontend");

const docsSrcDir = (): string => {
  const bundled = join(templatesDir(), "docs");
  if (existsSync(bundled) && readdirSync(bundled).length > 0) {
    return bundled;
  }

  // Source-mode fallback: read the canonical docs content straight from
  // webapp-frontend. Published builds get the CUSTOMER_DOC_FILES/DIRS subset
  // pre-copied into dist by scripts/copy-onboard-templates.mjs.
  return join(webappFrontendDir(), "src", "components", "docs", "content");
};

/**
 * Root the docs' `src/...` imports resolve against while inlining constants.
 * Published builds only ship the CUSTOMER_DOC_IMPORT_FILES subset, mirrored at
 * the same paths so both modes resolve identically.
 */
const docImportsRoot = (): string => {
  const bundled = join(templatesDir(), "docs-imports");
  return existsSync(bundled) ? bundled : webappFrontendDir();
};

/**
 * Materializes a Claude Code workspace under `<projectRoot>/.meticulous-onboard`
 * with CLAUDE.md, settings, customer-facing agents, and onboard-context.json.
 * The customer repo is edited via `--add-dir` when launching the agent.
 */
export const materializeOnboardWorkspace = (options: {
  projectRoot: string;
  context: OnboardContextJson;
}): string => {
  const { projectRoot } = options;
  const workspaceRelative = ONBOARD_WORKDIR;
  const claudeRelative = join(ONBOARD_WORKDIR, ".claude");
  const agentsRelative = join(claudeRelative, "agents");
  const docsRelative = join(claudeRelative, "docs");

  mkdirSafeSync(projectRoot, agentsRelative);
  const workspaceAbsolute = resolveSafeWritePath(
    projectRoot,
    workspaceRelative,
  );

  writeFileSafeSync(projectRoot, join(workspaceRelative, ".gitignore"), "*\n");

  const templates = templatesDir();
  writeFileSafeSync(
    projectRoot,
    join(claudeRelative, "CLAUDE.md"),
    readFileSync(join(templates, "CLAUDE.md"), "utf8"),
  );
  copyFileSafeSync(
    projectRoot,
    join(claudeRelative, "settings.json"),
    join(templates, "settings.json"),
  );

  const agentsSrc = agentsDir();
  const missing: string[] = [];
  for (const agentName of CUSTOMER_AGENT_NAMES) {
    const file = `${agentName}.md`;
    const src = join(agentsSrc, file);
    if (!existsSync(src)) {
      missing.push(file);
      continue;
    }
    copyFileSafeSync(projectRoot, join(agentsRelative, file), src);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing onboard agent template(s) in ${agentsSrc}: ${missing.join(", ")}. ` +
        `Update customer-agents.json if these agents were renamed or removed.`,
    );
  }

  // The agent playbooks cite these docs as `.claude/docs/<path>`; the live docs
  // pages render the recorder snippets and non-default CI tabs client-side, so
  // the files must be present locally rather than fetched.
  const docsSrc = docsSrcDir();
  const webappRoot = docImportsRoot();
  const missingDocs: string[] = [];
  for (const docPath of CUSTOMER_DOC_FILES) {
    const src = join(docsSrc, docPath);
    if (!existsSync(src)) {
      missingDocs.push(docPath);
      continue;
    }
    const destRelative = join(docsRelative, docPath);
    mkdirSafeSync(projectRoot, join(destRelative, ".."));
    copyDocIntoWorkspace(projectRoot, src, destRelative, webappRoot);
  }
  for (const docDir of CUSTOMER_DOC_DIRS) {
    const srcDir = join(docsSrc, docDir);
    if (!existsSync(srcDir)) {
      missingDocs.push(`${docDir}/`);
      continue;
    }
    copyDocsDirIntoWorkspace(
      projectRoot,
      srcDir,
      join(docsRelative, docDir),
      webappRoot,
    );
  }
  if (missingDocs.length > 0) {
    throw new Error(
      `Missing onboard doc file(s) in ${docsSrc}: ${missingDocs.join(", ")}. ` +
        `Update customer-docs.json if these docs were moved or renamed.`,
    );
  }

  const contextPayload = JSON.stringify(options.context, null, 2) + "\n";
  writeFileSafeSync(
    projectRoot,
    join(claudeRelative, "onboard-context.json"),
    contextPayload,
  );
  // Convenience copy at workspace root for prompts that say "read onboard-context.json".
  writeFileSafeSync(
    projectRoot,
    join(workspaceRelative, "onboard-context.json"),
    contextPayload,
  );

  ensureGitignoreEntry(projectRoot, ONBOARD_WORKDIR);

  return workspaceAbsolute;
};

/** Rewrites onboard-context.json in the materialized workspace (e.g. after skills/MCP install). */
export const updateOnboardContext = (options: {
  projectRoot: string;
  workspaceDir: string;
  context: OnboardContextJson;
}): void => {
  assertWorkspaceInsideProject(options.projectRoot, options.workspaceDir);
  const payload = JSON.stringify(options.context, null, 2) + "\n";
  writeFileSafeSync(
    options.projectRoot,
    join(ONBOARD_WORKDIR, ".claude", "onboard-context.json"),
    payload,
  );
  writeFileSafeSync(
    options.projectRoot,
    join(ONBOARD_WORKDIR, "onboard-context.json"),
    payload,
  );
};

/** Recursively copies a trusted docs dir into a repo-relative destination. */
const copyDocsDirIntoWorkspace = (
  projectRoot: string,
  srcDir: string,
  destRelative: string,
  webappRoot: string,
): void => {
  mkdirSafeSync(projectRoot, destRelative);
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destRelative, entry.name);
    if (entry.isDirectory()) {
      copyDocsDirIntoWorkspace(projectRoot, src, dest, webappRoot);
    } else if (entry.isFile()) {
      copyDocIntoWorkspace(projectRoot, src, dest, webappRoot);
    }
  }
};

/**
 * Copies one doc, inlining the constants it imports from other doc modules so
 * the agent reads the same content the docs site renders.
 */
const copyDocIntoWorkspace = (
  projectRoot: string,
  src: string,
  destRelative: string,
  webappRoot: string,
): void => {
  writeFileSafeSync(
    projectRoot,
    destRelative,
    inlineImportedDocConstants({
      source: readFileSync(src, "utf8"),
      docPath: src,
      webappRoot,
    }),
  );
};

const ensureGitignoreEntry = (projectRoot: string, entry: string): void => {
  const relativeGitignore = ".gitignore";
  const line = `${entry}/`;

  let content = "";
  let existedAsSafeFile = false;
  const gitignorePath = resolveSafeWritePath(projectRoot, relativeGitignore);
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, "utf8");
    existedAsSafeFile = true;
  }

  if (!existedAsSafeFile) {
    writeFileSafeSync(projectRoot, relativeGitignore, `${line}\n`);
    return;
  }

  if (
    content.split(/\r?\n/).some((l) => l.trim() === line || l.trim() === entry)
  ) {
    return;
  }
  const suffix = content.endsWith("\n") ? "" : "\n";
  writeFileSafeSync(
    projectRoot,
    relativeGitignore,
    `${content}${suffix}\n# Meticulous AI onboard workspace\n${line}\n`,
  );
};
