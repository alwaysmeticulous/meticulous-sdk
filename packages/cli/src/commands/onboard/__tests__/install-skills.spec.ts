import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { delimiter, join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSync = vi.fn();

vi.mock("child_process", () => ({
  spawnSync: (...args: unknown[]) => spawnSync(...args),
}));

import {
  SKILLS_ADD_ARGS,
  SKILLS_CLI_PACKAGE_SPEC,
  installSkills,
  sanitizeSkillsInstallEnv,
} from "../setup-agent-integrations";

const dirs: string[] = [];

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-skills-hijack-"));
  dirs.push(root);
  return root;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  spawnSync.mockReset();
});

/** Skills the discovery run reports, i.e. the dests the install will write. */
const DISCOVERED_SKILLS = ["meticulous-cli"];

/**
 * npm materializes the CLI; discovery stages skills; the last call is the repo
 * install. `stageInto` picks which agent root the staging run writes, since
 * that varies with the agents the skills CLI detects.
 */
const mockTrustedCliSpawns = (
  projectRoot: string,
  options: { stageInto?: string | null } = {},
): void => {
  const { stageInto = ".claude" } = options;
  spawnSync.mockImplementation(
    (
      command: string,
      args: string[] = [],
      spawnOptions: { cwd?: string } = {},
    ) => {
      if (command === "npm") {
        const prefix = args[args.indexOf("--prefix") + 1];
        mkdirSync(join(prefix, "node_modules", "skills", "bin"), {
          recursive: true,
        });
        writeFileSync(
          join(prefix, "node_modules", "skills", "bin", "cli.mjs"),
          "// trusted\n",
        );
        return { status: 0, error: undefined, stderr: "", stdout: "" };
      }
      if (
        command === process.execPath &&
        spawnOptions.cwd !== projectRoot &&
        stageInto !== null
      ) {
        for (const name of DISCOVERED_SKILLS) {
          mkdirSync(
            join(spawnOptions.cwd as string, stageInto, "skills", name),
            { recursive: true },
          );
        }
      }
      return { status: 0, error: undefined, stderr: "", stdout: "" };
    },
  );
};

/** Calls that hand the repo to the installer, as opposed to discovery. */
const repoInstallCalls = (projectRoot: string): unknown[][] =>
  spawnSync.mock.calls.filter(
    (call: unknown[]) =>
      call[0] === process.execPath &&
      (call[2] as { cwd?: string } | undefined)?.cwd === projectRoot,
  );

describe("sanitizeSkillsInstallEnv", () => {
  it("strips NODE_OPTIONS and NODE_PATH so a repo cannot inject preloads", () => {
    const sanitized = sanitizeSkillsInstallEnv({
      PATH: "/usr/bin",
      NODE_OPTIONS: "--require ./evil.js",
      NODE_PATH: "/evil/node_modules",
      HOME: "/home/dev",
    });

    expect(sanitized.PATH).toBe("/usr/bin");
    expect(sanitized.HOME).toBe("/home/dev");
    expect(sanitized.NODE_OPTIONS).toBeUndefined();
    expect(sanitized.NODE_PATH).toBeUndefined();
  });

  // `npm run` / `pnpm exec` export the repo's .npmrc as npm_config_*, and those
  // beat the temp-dir cwd, so the download could still come from a planted
  // registry or cache.
  it("strips npm_config_* so a repo .npmrc cannot redirect the download", () => {
    const sanitized = sanitizeSkillsInstallEnv({
      PATH: "/usr/bin",
      npm_config_registry: "http://127.0.0.1:9/",
      npm_config_cache: "/repo/.npm-cache",
      npm_config_userconfig: "/repo/.npmrc",
      NPM_CONFIG_REGISTRY: "http://127.0.0.1:9/",
    });

    expect(sanitized.npm_config_registry).toBeUndefined();
    expect(sanitized.npm_config_cache).toBeUndefined();
    expect(sanitized.npm_config_userconfig).toBeUndefined();
    expect(sanitized.NPM_CONFIG_REGISTRY).toBeUndefined();
    expect(sanitized.PATH).toBe("/usr/bin");
  });

  // `npm run` prepends node_modules/.bin, so even `npm` could be repo-supplied.
  it("drops node_modules/.bin from PATH so npm itself cannot be hijacked", () => {
    const sanitized = sanitizeSkillsInstallEnv({
      PATH: ["/repo/node_modules/.bin", "/usr/local/bin", "/usr/bin"].join(
        delimiter,
      ),
    });

    expect(sanitized.PATH).toBe(["/usr/local/bin", "/usr/bin"].join(delimiter));
  });

  it("preserves the developer's own npm config and unrelated vars", () => {
    const sanitized = sanitizeSkillsInstallEnv({
      PATH: "/usr/bin",
      HOME: "/home/dev",
      npm_lifecycle_event: "onboard",
    });

    // Only npm_config_* is repo-derived; HOME still points at the trusted
    // ~/.npmrc that npm falls back to.
    expect(sanitized.HOME).toBe("/home/dev");
    expect(sanitized.npm_lifecycle_event).toBe("onboard");
  });
});

describe("installSkills", () => {
  it("never resolves the skills CLI from the customer repo", () => {
    const projectRoot = makeRoot();
    // Plant a local skills binary that would win under `npx skills`.
    mkdirSync(join(projectRoot, "node_modules", ".bin"), { recursive: true });
    writeFileSync(
      join(projectRoot, "node_modules", ".bin", "skills"),
      "#!/bin/sh\necho HIJACKED\nexit 42\n",
      { mode: 0o755 },
    );

    spawnSync.mockImplementation(
      (
        command: string,
        args: string[] = [],
        options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
      ) => {
        if (command === "npm") {
          const prefixIdx = args.indexOf("--prefix");
          const prefix = args[prefixIdx + 1];
          expect(prefix).toBeTruthy();
          expect(prefix).not.toBe(projectRoot);
          expect(options.cwd).not.toBe(projectRoot);
          expect(args).toContain(SKILLS_CLI_PACKAGE_SPEC);
          expect(args).toContain("--ignore-scripts");
          expect(options.env?.NODE_OPTIONS).toBeUndefined();
          expect(options.env?.npm_config_registry).toBeUndefined();
          expect(options.env?.PATH ?? "").not.toContain("node_modules/.bin");
          mkdirSync(join(prefix, "node_modules", "skills", "bin"), {
            recursive: true,
          });
          writeFileSync(
            join(prefix, "node_modules", "skills", "bin", "cli.mjs"),
            "// trusted\n",
          );
          return { status: 0, error: undefined, stderr: "", stdout: "" };
        }

        if (command === process.execPath) {
          expect(args[0]).toMatch(
            /node_modules[/\\]skills[/\\]bin[/\\]cli\.mjs$/,
          );
          expect(args[0].startsWith(projectRoot)).toBe(false);
          expect(options.env?.NODE_OPTIONS).toBeUndefined();

          // The discovery run goes into a throwaway dir, never the repo.
          if (options.cwd !== projectRoot) {
            expect(options.cwd).toBeTruthy();
            for (const name of DISCOVERED_SKILLS) {
              mkdirSync(
                join(options.cwd as string, ".claude", "skills", name),
                {
                  recursive: true,
                },
              );
            }
            return { status: 0, error: undefined, stderr: "", stdout: "" };
          }

          expect(args.slice(1)).toEqual([...SKILLS_ADD_ARGS]);
          return { status: 0, error: undefined, stderr: "", stdout: "" };
        }

        throw new Error(`unexpected spawn: ${command} ${args.join(" ")}`);
      },
    );

    const previousEnv = {
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      npm_config_registry: process.env.npm_config_registry,
      PATH: process.env.PATH,
    };
    process.env.NODE_OPTIONS = "--require ./evil.js";
    process.env.npm_config_registry = "http://127.0.0.1:9/";
    process.env.PATH = [
      join(projectRoot, "node_modules", ".bin"),
      previousEnv.PATH ?? "",
    ].join(delimiter);
    try {
      expect(installSkills(projectRoot)).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    const commands = spawnSync.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    // npm install, discovery run, then the install into the repo.
    expect(commands).toEqual(["npm", process.execPath, process.execPath]);
    expect(commands).not.toContain("npx");
    expect(commands).not.toContain("skills");
  });

  // Another tool's linked skill is never a dest of this install, so it must
  // not stop us installing ours.
  it("installs even when another tool's skill is a symlink", () => {
    const projectRoot = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-skills-other-"));
    dirs.push(outside);
    mkdirSync(join(projectRoot, ".claude", "skills"), { recursive: true });
    symlinkSync(
      outside,
      join(projectRoot, ".claude", "skills", "some-other-tool"),
    );
    mockTrustedCliSpawns(projectRoot);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(installSkills(projectRoot)).toBe(true);
    } finally {
      log.mockRestore();
    }

    expect(repoInstallCalls(projectRoot)).toHaveLength(1);
    expect(
      lstatSync(
        join(projectRoot, ".claude", "skills", "some-other-tool"),
      ).isSymbolicLink(),
    ).toBe(true);
  });

  // Which roots the staging run writes depends on the agents the skills CLI
  // detects, so discovery must not assume `.claude`.
  it("discovers skill names staged under any agent root", () => {
    const projectRoot = makeRoot();
    const cache = mkdtempSync(join(tmpdir(), "onboard-skills-cache-"));
    dirs.push(cache);
    mkdirSync(join(projectRoot, ".claude", "skills"), { recursive: true });
    const leftover = join(projectRoot, ".claude", "skills", "meticulous-cli");
    symlinkSync(cache, leftover);
    mockTrustedCliSpawns(projectRoot, { stageInto: ".agents" });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(installSkills(projectRoot)).toBe(true);
    } finally {
      log.mockRestore();
    }

    // Discovery found the name, so the leftover link was cleared for --copy.
    expect(repoInstallCalls(projectRoot)).toHaveLength(1);
    expect(() => lstatSync(leftover)).toThrow();
  });

  // An empty name list would silently disable every symlink guard.
  it("does not install when discovery finds no skills", () => {
    const projectRoot = makeRoot();
    mockTrustedCliSpawns(projectRoot, { stageInto: null });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(installSkills(projectRoot)).toBe(false);
    } finally {
      log.mockRestore();
    }

    expect(repoInstallCalls(projectRoot)).toHaveLength(0);
  });

  // Here the installer would write into the dest and follow the nested link.
  it("never runs the installer into a dest holding a nested symlink", () => {
    const projectRoot = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-skills-planted-"));
    dirs.push(outside);
    mkdirSync(join(projectRoot, ".claude", "skills", "meticulous-cli"), {
      recursive: true,
    });
    const planted = join(
      projectRoot,
      ".claude",
      "skills",
      "meticulous-cli",
      "scripts",
    );
    symlinkSync(outside, planted);
    mockTrustedCliSpawns(projectRoot);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(installSkills(projectRoot)).toBe(false);
    } finally {
      log.mockRestore();
    }

    expect(repoInstallCalls(projectRoot)).toHaveLength(0);
    expect(lstatSync(planted).isSymbolicLink()).toBe(true);
  });

  it("continues without skills when the registry download fails", () => {
    const projectRoot = makeRoot();
    spawnSync.mockImplementation(() => ({
      status: 1,
      error: undefined,
      stderr: "network down",
      stdout: "",
    }));

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(installSkills(projectRoot)).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
