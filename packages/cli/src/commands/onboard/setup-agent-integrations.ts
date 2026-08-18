import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { delimiter, join } from "path";
import chalk from "chalk";
import { CliUserError } from "../../utils/cli-user-error";
import { mergeCodexMcp } from "./codex-mcp";
import {
  assertSafeSkillsInstallTargets,
  prepareSafeSkillsInstallTargets,
  resolveSafeWritePath,
  writeFileSafeSync,
} from "./safe-repo-fs";

export const METICULOUS_MCP_URL = "https://app.meticulous.ai/api/mcp";

/**
 * Registry package + pinned version for the `skills` CLI. Must never be
 * resolved from the customer repo's node_modules (see installSkills).
 */
export const SKILLS_CLI_PACKAGE_SPEC = "skills@1.5.22";

/** Args after the skills CLI entry — shared with the retry hint. */
export const SKILLS_ADD_ARGS = [
  "add",
  "alwaysmeticulous/skills",
  "--skill",
  "*",
  "--agent",
  "claude-code",
  "--agent",
  "codex",
  "--agent",
  "cursor",
  "--copy",
  "-y",
] as const;

/** Paths the CLI may create for agent integrations — include these in the PR. */
export const AGENT_INTEGRATION_PATHS = [
  ".claude/skills/",
  ".agents/skills/",
  ".cursor/skills/",
  "skills-lock.json",
  ".mcp.json",
  ".cursor/mcp.json",
  ".codex/config.toml",
] as const;

export const setupAgentIntegrations = (options: {
  projectRoot: string;
}): string[] => {
  console.log(chalk.bold("Setting up Meticulous agent integrations…"));

  // Install skills for all supported agents so the onboarding PR is useful
  // regardless of which tool teammates use later.
  const skillsInstalled = installSkills(options.projectRoot);
  installProjectMcp(options.projectRoot);

  const created = listExistingIntegrationPaths(
    options.projectRoot,
    skillsInstalled,
  );
  if (created.length > 0) {
    console.log(
      chalk.dim(
        `  These files should be included in the onboarding PR:\n${created
          .map((p) => `    - ${p}`)
          .join("\n")}`,
      ),
    );
  }
  console.log("");
  return created;
};

export const installSkills = (projectRoot: string): boolean => {
  // Reject repo-seeded symlinks on every path the skills installer may write
  // (`.claude`, `.agents`, `.cursor`, `skills-lock.json`), then create those
  // directory roots as real dirs before handing control to the installer.
  prepareSafeSkillsInstallTargets(projectRoot);

  // Never `npx skills` with cwd=projectRoot: npx prefers a repo-local
  // `node_modules/.bin/skills` (or a `file:` dependency) over the registry,
  // so an untrusted repo could run arbitrary code before any agent sandbox.
  // Materialize the registry CLI into a throwaway prefix, then invoke it by
  // absolute path via `node`.
  let trustedCli: ReturnType<typeof materializeTrustedSkillsCli> | null = null;
  let result: ReturnType<typeof spawnSync>;
  try {
    trustedCli = materializeTrustedSkillsCli();
    result = spawnSync(
      process.execPath,
      [trustedCli.cliEntry, ...SKILLS_ADD_ARGS],
      {
        cwd: projectRoot,
        stdio: "inherit",
        env: sanitizeSkillsInstallEnv(process.env),
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error ? `: ${error.message}` : `: ${String(error)}`;
    console.log(
      chalk.yellow(
        `  Could not install Meticulous skills${detail}. Continuing without them.`,
      ),
    );
    console.log(chalk.dim(`  Retry: ${skillsInstallRetryHint(projectRoot)}`));
    assertSafeSkillsInstallTargets(projectRoot);
    return false;
  } finally {
    trustedCli?.cleanup();
  }

  // Always re-check after the installer — a failed or partial install can
  // still plant a symlink escape on a destination we pre-created.
  assertSafeSkillsInstallTargets(projectRoot);

  if (result.error || result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : "";
    console.log(
      chalk.yellow(
        `  Could not install Meticulous skills${detail}. Continuing without them.`,
      ),
    );
    console.log(chalk.dim(`  Retry: ${skillsInstallRetryHint(projectRoot)}`));
    return false;
  }

  console.log(chalk.green("  ✓ Installed Meticulous skills"));
  return true;
};

/** Matches a `node_modules/.bin` PATH entry, on either path separator. */
const isPackageBinPathEntry = (entry: string): boolean =>
  /(?:^|[\\/])node_modules[\\/]\.bin[\\/]?$/u.test(entry.trim());

/**
 * Drops env vars that can redirect Node/npm resolution or inject code into
 * the child. The customer repo stays as cwd for install destinations, so we
 * must not inherit hooks that run before the trusted CLI entry.
 *
 * Installing from a temp cwd is not enough on its own: running onboard through
 * `npm run` / `pnpm exec` exports the repo's `.npmrc` as `npm_config_*`, which
 * takes precedence over cwd, and prepends `node_modules/.bin` to PATH so even
 * `npm` itself could be repo-controlled. Dropping both falls back to the
 * developer's own user and global npm config, which is trusted.
 */
export const sanitizeSkillsInstallEnv = (
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const next: NodeJS.ProcessEnv = { ...env };
  delete next.NODE_OPTIONS;
  delete next.NODE_PATH;

  for (const key of Object.keys(next)) {
    if (/^npm_config_/iu.test(key)) {
      delete next[key];
      continue;
    }
    // Windows spells it `Path`, so match case-insensitively.
    if (key.toUpperCase() !== "PATH") {
      continue;
    }
    const value = next[key];
    if (typeof value !== "string") {
      continue;
    }
    next[key] = value
      .split(delimiter)
      .filter((entry) => entry.length > 0 && !isPackageBinPathEntry(entry))
      .join(delimiter);
  }

  return next;
};

/**
 * Installs the pinned registry `skills` package into a fresh temp prefix and
 * returns the absolute path to its CLI entry. Callers must invoke `cleanup`
 * (including on failure after a successful materialize).
 */
export const materializeTrustedSkillsCli = (): {
  cliEntry: string;
  cleanup: () => void;
} => {
  const tempDir = mkdtempSync(join(tmpdir(), "meticulous-skills-cli-"));
  const cleanup = (): void => {
    rmSync(tempDir, { recursive: true, force: true });
  };

  const install = spawnSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-save",
      "--prefix",
      tempDir,
      SKILLS_CLI_PACKAGE_SPEC,
    ],
    {
      // Install outside the customer repo so a local `skills` package cannot
      // satisfy the request.
      cwd: tempDir,
      encoding: "utf8",
      env: sanitizeSkillsInstallEnv(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (install.error || install.status !== 0) {
    cleanup();
    const stderr = (install.stderr ?? "").toString().trim();
    const detail =
      install.error?.message ??
      (stderr.length > 0 ? stderr : `npm exited ${install.status}`);
    throw new Error(`failed to download ${SKILLS_CLI_PACKAGE_SPEC}: ${detail}`);
  }

  const cliEntry = join(tempDir, "node_modules", "skills", "bin", "cli.mjs");
  if (!existsSync(cliEntry)) {
    cleanup();
    throw new Error(
      `${SKILLS_CLI_PACKAGE_SPEC} installed without bin/cli.mjs at ${cliEntry}`,
    );
  }

  return { cliEntry, cleanup };
};

const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Paste-able equivalent of the install above. The download must run from the
 * temp prefix, never the repo: npm reads `.npmrc` from its cwd, so a repo one
 * could point `skills` at a customer-controlled registry. Only the CLI entry
 * runs from the repo, since that is where skills get written.
 */
const skillsInstallRetryHint = (projectRoot: string): string => {
  const prefix = '"$prefix"';
  const addArgs = SKILLS_ADD_ARGS.map(shellQuote).join(" ");
  return (
    `prefix="${"${TMPDIR:-/tmp}"}/meticulous-skills-cli" && mkdir -p ${prefix} && ` +
    `(cd ${prefix} && npm install --ignore-scripts --no-save --prefix ${prefix} ${SKILLS_CLI_PACKAGE_SPEC}) && ` +
    `(cd ${shellQuote(projectRoot)} && node ${prefix}/node_modules/skills/bin/cli.mjs ${addArgs})`
  );
};

const installProjectMcp = (projectRoot: string): void => {
  // Always attempt every MCP config file. A parse/shape failure on one must
  // not skip the others — otherwise a poisoned `.mcp.json` can leave an
  // attacker-controlled `command`/`args` Meticulous server in Cursor/Codex.
  // Any failure aborts onboard (via CliUserError); silently continuing would
  // leave unsanitized MCP config under the official name.
  ensureProjectMcp(projectRoot);
  console.log(chalk.green("  ✓ Added project-scoped Meticulous MCP"));
};

/** Writes the canonical Meticulous MCP config into Claude/Cursor/Codex files. */
export const ensureProjectMcp = (projectRoot: string): void => {
  const failures: string[] = [];
  const attempts: Array<{ label: string; run: () => void }> = [
    {
      label: ".mcp.json",
      run: () =>
        mergeJsonMcp(projectRoot, ".mcp.json", {
          type: "http",
          url: METICULOUS_MCP_URL,
        }),
    },
    {
      label: ".cursor/mcp.json",
      run: () =>
        mergeJsonMcp(projectRoot, join(".cursor", "mcp.json"), {
          url: METICULOUS_MCP_URL,
        }),
    },
    {
      label: ".codex/config.toml",
      run: () =>
        mergeCodexMcp(
          projectRoot,
          join(".codex", "config.toml"),
          METICULOUS_MCP_URL,
        ),
    },
  ];

  for (const attempt of attempts) {
    try {
      attempt.run();
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : `${attempt.label}: ${String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new CliUserError(
      [
        "Could not safely configure the Meticulous MCP server in every agent config.",
        "Fix or remove the failing file(s), then re-run `meticulous onboard`:",
        ...failures.map((message) => `  - ${message}`),
      ].join("\n"),
    );
  }
};

const listExistingIntegrationPaths = (
  projectRoot: string,
  skillsInstalled: boolean,
): string[] => {
  const found: string[] = [];
  for (const path of AGENT_INTEGRATION_PATHS) {
    if (!skillsInstalled && isPrecreatedSkillsDirPath(path)) {
      continue;
    }
    const absolute = join(projectRoot, path);
    if (existsSync(absolute)) {
      found.push(path);
    }
  }
  return found;
};

const isPrecreatedSkillsDirPath = (path: string): boolean =>
  path === ".claude/skills/" ||
  path === ".agents/skills/" ||
  path === ".cursor/skills/";

const mergeJsonMcp = (
  projectRoot: string,
  relativePath: string,
  serverConfig: Record<string, unknown>,
): void => {
  const absolutePath = resolveSafeWritePath(projectRoot, relativePath);
  let config: Record<string, unknown> = {};
  if (existsSync(absolutePath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
    } catch {
      throw new CliUserError(
        `Refusing to update '${relativePath}': file is not valid JSON. ` +
          `Fix or remove it, then re-run \`meticulous onboard\`.`,
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CliUserError(
        `Refusing to update '${relativePath}': top-level value must be a JSON object.`,
      );
    }
    config = parsed as Record<string, unknown>;
  }

  const existingServers = config["mcpServers"];
  if (
    existingServers !== undefined &&
    (!existingServers ||
      typeof existingServers !== "object" ||
      Array.isArray(existingServers))
  ) {
    throw new CliUserError(
      `Refusing to update '${relativePath}': mcpServers must be a JSON object.`,
    );
  }

  const mcpServers = (existingServers ?? {}) as Record<string, unknown>;
  // Only trust a pre-existing entry when it is an exact match of the
  // canonical config. A matching `url` alone is not enough — extra fields
  // like `command` / `args` / `env` would keep an attacker-controlled local
  // MCP server under the official "Meticulous" name.
  if (isExactJsonServerConfig(mcpServers["Meticulous"], serverConfig)) {
    return;
  }

  writeFileSafeSync(
    projectRoot,
    relativePath,
    JSON.stringify(
      {
        ...config,
        mcpServers: {
          ...mcpServers,
          Meticulous: serverConfig,
        },
      },
      null,
      2,
    ) + "\n",
  );
};

/**
 * True only when `existing` is a plain object with exactly the same keys and
 * primitive values as `expected` (no extras, no nesting surprises).
 */
export const isExactJsonServerConfig = (
  existing: unknown,
  expected: Record<string, unknown>,
): boolean => {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return false;
  }
  const record = existing as Record<string, unknown>;
  const existingKeys = Object.keys(record).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    existingKeys.length !== expectedKeys.length ||
    existingKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return false;
  }
  return expectedKeys.every((key) => record[key] === expected[key]);
};
