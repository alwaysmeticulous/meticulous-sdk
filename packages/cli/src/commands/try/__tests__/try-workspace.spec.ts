import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readTryContext,
  writeTryContext,
  type TryContextJson,
} from "../shared/try-context";
import { materializeTryWorkspace } from "../start/materialize-try-workspace";
import { deriveProjectName, detectPackageManager } from "../start/repo-facts";
import { buildTrySettings } from "../start/try-settings";

const dirs: string[] = [];

const makeDir = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "try-ws-")));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("materializeTryWorkspace", () => {
  it("writes CLAUDE.md, agents, skills, settings, MCP config and a gitignore entry", () => {
    const repo = makeDir();
    writeFileSync(join(repo, ".gitignore"), "node_modules\n");

    const workspace = materializeTryWorkspace({
      repoRoot: repo,
      packageManager: "pnpm",
    });

    expect(workspace).toBe(join(repo, ".meticulous-try"));
    for (const file of [
      ".gitignore",
      ".mcp.json",
      ".claude/CLAUDE.md",
      ".claude/settings.json",
      ".claude/agents/pr-backtester.md",
      ".claude/agents/session-recorder.md",
      ".claude/skills/try-build-and-serve/SKILL.md",
      ".claude/skills/try-record-coverage/SKILL.md",
      ".claude/skills/try-app-login/SKILL.md",
      ".claude/skills/try-backtest-prs/SKILL.md",
      ".claude/skills/try-report-results/SKILL.md",
    ]) {
      expect(existsSync(join(workspace, file)), file).toBe(true);
    }
    expect(readFileSync(join(workspace, ".gitignore"), "utf8")).toBe("*\n");
    expect(
      JSON.parse(readFileSync(join(workspace, ".mcp.json"), "utf8")),
    ).toEqual({
      mcpServers: {
        Meticulous: { type: "http", url: "https://app.meticulous.ai/api/mcp" },
      },
    });
    const settings = JSON.parse(
      readFileSync(join(workspace, ".claude/settings.json"), "utf8"),
    ) as {
      permissions: { allow: string[] };
    };
    expect(settings.permissions.allow).toContain("Bash(pnpm:*)");
    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toContain(
      ".meticulous-try/",
    );

    materializeTryWorkspace({ repoRoot: repo, packageManager: "pnpm" });
    expect(
      readFileSync(join(repo, ".gitignore"), "utf8").match(
        /\.meticulous-try\//g,
      ),
    ).toHaveLength(1);
  });

  it("refuses to write through a planted symlink", () => {
    const repo = makeDir();
    const elsewhere = makeDir();
    symlinkSync(elsewhere, join(repo, ".meticulous-try"));
    expect(() =>
      materializeTryWorkspace({ repoRoot: repo, packageManager: null }),
    ).toThrow(/symlink/);
  });
});

describe("try-context.json", () => {
  it("is written owner-only and reads back", () => {
    const repo = makeDir();
    const context = {
      version: 1,
      apiToken: "secret",
    } as unknown as TryContextJson;
    const path = writeTryContext(repo, context);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readTryContext(repo)).toEqual(context);
  });
});

describe("buildTrySettings", () => {
  it("allows only the detected package manager and denies git writes", () => {
    const settings = buildTrySettings("yarn") as {
      permissions: { allow: string[]; deny: string[] };
    };
    expect(settings.permissions.allow).toContain("Bash(yarn:*)");
    expect(settings.permissions.allow).not.toContain("Bash(pnpm:*)");
    expect(settings.permissions.allow).toContain("Bash(meticulous:*)");
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining(["Bash(git push:*)", "Bash(git commit:*)"]),
    );
  });

  it("allows every package manager when none was detected", () => {
    const settings = buildTrySettings(null) as {
      permissions: { allow: string[] };
    };
    for (const manager of ["npm", "pnpm", "yarn", "bun"]) {
      expect(settings.permissions.allow).toContain(`Bash(${manager}:*)`);
    }
  });
});

describe("deriveProjectName", () => {
  it.each([
    ["git@github.com:acme/web-app.git", "web-app"],
    ["https://gitlab.com/group/sub/shop.git", "shop"],
    ["https://github.com/acme/My Repo/", "My-Repo"],
  ])("%s -> %s", (url, expected) => {
    expect(deriveProjectName("/tmp/whatever", url)).toBe(expected);
  });

  it("falls back to the directory name", () => {
    expect(deriveProjectName("/home/dev/storefront", null)).toBe("storefront");
  });
});

describe("detectPackageManager", () => {
  it("prefers the packageManager field, then lockfiles, in directory order", () => {
    const root = makeDir();
    const app = makeDir();
    writeFileSync(join(app, "yarn.lock"), "");
    expect(detectPackageManager([root, app])).toBe("yarn");
    writeFileSync(join(root, "package-lock.json"), "{}");
    expect(detectPackageManager([root, app])).toBe("npm");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@10.0.0" }),
    );
    expect(detectPackageManager([root, app])).toBe("pnpm");
    expect(detectPackageManager([makeDir()])).toBeNull();
  });
});
