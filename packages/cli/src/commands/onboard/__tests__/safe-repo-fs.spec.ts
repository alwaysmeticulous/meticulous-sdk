import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  SKILLS_INSTALL_DIR_ROOTS,
  assertSafeSkillsInstallTargets,
  mkdirSafeSync,
  prepareSafeSkillsInstallTargets,
  resolveSafeWritePath,
  writeFileSafeSync,
} from "../safe-repo-fs";

const dirs: string[] = [];

const makeRoot = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "onboard-safe-fs-")));
  dirs.push(root);
  return root;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveSafeWritePath", () => {
  it("resolves a normal relative path under the project root", () => {
    const root = makeRoot();
    expect(resolveSafeWritePath(root, ".meticulous-onboard")).toBe(
      join(root, ".meticulous-onboard"),
    );
  });

  it("rejects path escape via ..", () => {
    const root = makeRoot();
    expect(() => resolveSafeWritePath(root, "../outside")).toThrow(
      CliUserError,
    );
  });

  it("rejects writing through a symlinked directory", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "secret"), "do-not-touch");
    symlinkSync(outside, join(root, ".meticulous-onboard"));

    expect(() =>
      writeFileSafeSync(root, join(".meticulous-onboard", "owned.txt"), "x"),
    ).toThrow(/symlink/i);
    // Outside target must remain untouched beyond the pre-seeded file.
    expect(() =>
      resolveSafeWritePath(root, join(".meticulous-onboard", "owned.txt")),
    ).toThrow(CliUserError);
  });

  it("rejects writing through a symlinked file such as .gitignore", () => {
    const root = makeRoot();
    const outside = join(tmpdir(), `onboard-gitignore-${Date.now()}`);
    writeFileSync(outside, "preexisting\n");
    dirs.push(outside);
    symlinkSync(outside, join(root, ".gitignore"));

    expect(() =>
      writeFileSafeSync(root, ".gitignore", ".meticulous-onboard/\n"),
    ).toThrow(/symlink/i);
  });

  it("creates nested real directories and writes safely", () => {
    const root = makeRoot();
    mkdirSafeSync(root, join(".meticulous-onboard", ".claude", "agents"));
    writeFileSafeSync(
      root,
      join(".meticulous-onboard", ".claude", "CLAUDE.md"),
      "ok\n",
    );
    expect(
      resolveSafeWritePath(
        root,
        join(".meticulous-onboard", ".claude", "CLAUDE.md"),
      ),
    ).toBe(join(root, ".meticulous-onboard", ".claude", "CLAUDE.md"));
  });

  it("rejects when an intermediate path component is a symlink", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-mid-"));
    dirs.push(outside);
    mkdirSync(join(root, ".cursor"));
    symlinkSync(outside, join(root, ".cursor", "mcp.json"));

    expect(() =>
      writeFileSafeSync(
        root,
        join(".cursor", "mcp.json"),
        JSON.stringify({ mcpServers: {} }),
      ),
    ).toThrow(/symlink/i);
  });
});

describe("prepareSafeSkillsInstallTargets", () => {
  it("creates real .claude/.agents/.cursor skills dirs", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root);
    for (const dir of SKILLS_INSTALL_DIR_ROOTS) {
      expect(lstatSync(join(root, dir)).isSymbolicLink()).toBe(false);
      expect(lstatSync(join(root, dir, "skills")).isDirectory()).toBe(true);
    }
  });

  it("rejects a symlinked .agents before skills install", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-agents-out-"));
    dirs.push(outside);
    symlinkSync(outside, join(root, ".agents"));

    expect(() => prepareSafeSkillsInstallTargets(root)).toThrow(/symlink/i);
  });

  it("rejects a symlinked .cursor before skills install", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-cursor-out-"));
    dirs.push(outside);
    symlinkSync(outside, join(root, ".cursor"));

    expect(() => prepareSafeSkillsInstallTargets(root)).toThrow(/symlink/i);
  });

  it("rejects a symlinked skills-lock.json before skills install", () => {
    const root = makeRoot();
    const outside = join(tmpdir(), `onboard-lock-${Date.now()}`);
    writeFileSync(outside, "{}\n");
    dirs.push(outside);
    symlinkSync(outside, join(root, "skills-lock.json"));

    expect(() => prepareSafeSkillsInstallTargets(root)).toThrow(/symlink/i);
  });

  it("rejects a nested skill-name symlink under an otherwise real skills dir", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-out-"));
    dirs.push(outside);
    // Real parents — the shallow check would pass — with a last-component
    // escape the installer would write through.
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    symlinkSync(outside, join(root, ".claude", "skills", "evil-skill"));

    expect(() => prepareSafeSkillsInstallTargets(root)).toThrow(
      /symlink.*\.claude\/skills\/evil-skill/i,
    );
  });

  it("rejects nested skill symlinks under .agents and .cursor too", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-out-"));
    dirs.push(outside);

    for (const dir of [".agents", ".cursor"] as const) {
      mkdirSync(join(root, dir, "skills"), { recursive: true });
      symlinkSync(outside, join(root, dir, "skills", "planted"));
      expect(() => prepareSafeSkillsInstallTargets(root)).toThrow(/symlink/i);
      rmSync(join(root, dir), { recursive: true, force: true });
    }
  });
});

describe("assertSafeSkillsInstallTargets", () => {
  it("rejects a nested symlink planted after the pre-check", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root);

    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-toctou-"));
    dirs.push(outside);
    symlinkSync(outside, join(root, ".claude", "skills", "toctou-skill"));

    expect(() => assertSafeSkillsInstallTargets(root)).toThrow(
      /symlink.*toctou-skill/i,
    );
  });

  it("allows a real nested skill directory with no symlinks", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root);
    mkdirSync(join(root, ".claude", "skills", "meticulous-cli", "scripts"), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".claude", "skills", "meticulous-cli", "SKILL.md"),
      "# ok\n",
    );

    expect(() => assertSafeSkillsInstallTargets(root)).not.toThrow();
  });
});
