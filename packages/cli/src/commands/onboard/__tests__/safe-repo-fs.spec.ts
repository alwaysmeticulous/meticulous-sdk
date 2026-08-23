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

/** The skills the install under test will write. */
const SKILL_NAMES = ["meticulous-cli"];

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
    prepareSafeSkillsInstallTargets(root, SKILL_NAMES);
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

    expect(() => prepareSafeSkillsInstallTargets(root, SKILL_NAMES)).toThrow(
      /symlink/i,
    );
  });

  it("rejects a symlinked .cursor before skills install", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-cursor-out-"));
    dirs.push(outside);
    symlinkSync(outside, join(root, ".cursor"));

    expect(() => prepareSafeSkillsInstallTargets(root, SKILL_NAMES)).toThrow(
      /symlink/i,
    );
  });

  it("rejects a symlinked skills-lock.json before skills install", () => {
    const root = makeRoot();
    const outside = join(tmpdir(), `onboard-lock-${Date.now()}`);
    writeFileSync(outside, "{}\n");
    dirs.push(outside);
    symlinkSync(outside, join(root, "skills-lock.json"));

    expect(() => prepareSafeSkillsInstallTargets(root, SKILL_NAMES)).toThrow(
      /symlink/i,
    );
  });

  it("unlinks a leftover dest for a skill being installed so --copy can write a real directory", () => {
    const root = makeRoot();
    const cache = mkdtempSync(join(tmpdir(), "onboard-skill-cache-"));
    dirs.push(cache);
    writeFileSync(join(cache, "SKILL.md"), "from cache\n");
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    symlinkSync(cache, join(root, ".claude", "skills", "meticulous-cli"));

    expect(
      prepareSafeSkillsInstallTargets(root, SKILL_NAMES).blockingLinks,
    ).toEqual([]);

    const dest = join(root, ".claude", "skills", "meticulous-cli");
    expect(lstatSync(cache).isDirectory()).toBe(true);
    expect(() => lstatSync(dest)).toThrow();
  });

  // Another tool's linked skill is never a dest of this install, so it neither
  // gets deleted nor stops us installing.
  it("ignores a skill link for a skill this install does not write", () => {
    const root = makeRoot();
    const cache = mkdtempSync(join(tmpdir(), "onboard-third-party-"));
    dirs.push(cache);
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    const theirs = join(root, ".claude", "skills", "some-other-tool");
    symlinkSync(cache, theirs);
    symlinkSync(cache, join(root, ".claude", "skills", "meticulous-cli"));

    expect(
      prepareSafeSkillsInstallTargets(root, SKILL_NAMES).blockingLinks,
    ).toEqual([]);

    expect(lstatSync(theirs).isSymbolicLink()).toBe(true);
    expect(() =>
      lstatSync(join(root, ".claude", "skills", "meticulous-cli")),
    ).toThrow();
  });

  it("ignores a symlink nested inside another tool's skill", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-third-party-nested-"));
    dirs.push(outside);
    mkdirSync(join(root, ".claude", "skills", "some-other-tool"), {
      recursive: true,
    });
    symlinkSync(
      outside,
      join(root, ".claude", "skills", "some-other-tool", "scripts"),
    );

    expect(
      prepareSafeSkillsInstallTargets(root, SKILL_NAMES).blockingLinks,
    ).toEqual([]);
  });

  // Here we really cannot install: the installer writes into this dest and
  // would follow the nested link, and it is not ours to delete.
  it("reports a symlink nested inside a dest this install writes", () => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-nested-"));
    dirs.push(outside);
    mkdirSync(join(root, ".claude", "skills", "meticulous-cli"), {
      recursive: true,
    });
    symlinkSync(
      outside,
      join(root, ".claude", "skills", "meticulous-cli", "scripts"),
    );

    expect(
      prepareSafeSkillsInstallTargets(root, SKILL_NAMES).blockingLinks,
    ).toEqual([".claude/skills/meticulous-cli/scripts"]);
  });

  it("leaves leftover dests in place when the install is blocked", () => {
    const root = makeRoot();
    const cache = mkdtempSync(join(tmpdir(), "onboard-mixed-"));
    dirs.push(cache);
    mkdirSync(join(root, ".agents", "skills", "meticulous-cli"), {
      recursive: true,
    });
    symlinkSync(
      cache,
      join(root, ".agents", "skills", "meticulous-cli", "scripts"),
    );
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    const leftover = join(root, ".claude", "skills", "meticulous-cli");
    symlinkSync(cache, leftover);

    expect(
      prepareSafeSkillsInstallTargets(root, SKILL_NAMES).blockingLinks,
    ).toEqual([".agents/skills/meticulous-cli/scripts"]);
    // The installer will not run, so there is nothing to make room for.
    expect(lstatSync(leftover).isSymbolicLink()).toBe(true);
  });

  it("unlinks leftover dests under every agent tree", () => {
    const root = makeRoot();
    const cache = mkdtempSync(join(tmpdir(), "onboard-skill-out-"));
    dirs.push(cache);

    for (const dir of [".claude", ".agents", ".cursor"] as const) {
      mkdirSync(join(root, dir, "skills"), { recursive: true });
      symlinkSync(cache, join(root, dir, "skills", "meticulous-cli"));
    }

    prepareSafeSkillsInstallTargets(root, SKILL_NAMES);

    for (const dir of [".claude", ".agents", ".cursor"] as const) {
      expect(() =>
        lstatSync(join(root, dir, "skills", "meticulous-cli")),
      ).toThrow();
    }
    expect(lstatSync(cache).isDirectory()).toBe(true);
  });
});

describe("assertSafeSkillsInstallTargets", () => {
  // The pre-check leaves every dest we write symlink-free, so one appearing
  // afterwards was planted during the install.
  it("rejects a symlink planted on a dest after the pre-check", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root, SKILL_NAMES);

    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-toctou-"));
    dirs.push(outside);
    symlinkSync(outside, join(root, ".claude", "skills", "meticulous-cli"));

    expect(() => assertSafeSkillsInstallTargets(root, SKILL_NAMES)).toThrow(
      /symlink.*meticulous-cli/i,
    );
  });

  it("rejects a symlink planted inside a dest after the pre-check", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root, SKILL_NAMES);

    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-toctou-deep-"));
    dirs.push(outside);
    mkdirSync(join(root, ".claude", "skills", "meticulous-cli"), {
      recursive: true,
    });
    symlinkSync(
      outside,
      join(root, ".claude", "skills", "meticulous-cli", "scripts"),
    );

    expect(() => assertSafeSkillsInstallTargets(root, SKILL_NAMES)).toThrow(
      /symlink.*meticulous-cli\/scripts/i,
    );
  });

  it("ignores another tool's skill link", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root, SKILL_NAMES);

    const outside = mkdtempSync(join(tmpdir(), "onboard-skill-other-"));
    dirs.push(outside);
    symlinkSync(outside, join(root, ".claude", "skills", "some-other-tool"));

    expect(() =>
      assertSafeSkillsInstallTargets(root, SKILL_NAMES),
    ).not.toThrow();
  });

  it("allows a real nested skill directory with no symlinks", () => {
    const root = makeRoot();
    prepareSafeSkillsInstallTargets(root, SKILL_NAMES);
    mkdirSync(join(root, ".claude", "skills", "meticulous-cli", "scripts"), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".claude", "skills", "meticulous-cli", "SKILL.md"),
      "# ok\n",
    );

    expect(() =>
      assertSafeSkillsInstallTargets(root, SKILL_NAMES),
    ).not.toThrow();
  });
});
