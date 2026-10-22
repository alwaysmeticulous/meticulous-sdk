import { mkdirSync, mkdtempSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { decodeProjectDirName } from "../convert/decode-project-dir-name";

const encode = (path: string) =>
  path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");

describe("decodeProjectDirName", () => {
  it("finds the existing directory whose path Cursor encoded", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "at-cursor-decode-")));
    const project = join(root, "code", "my.app-v2");
    mkdirSync(project, { recursive: true });
    mkdirSync(join(root, "code", "my"), { recursive: true });
    expect(decodeProjectDirName(encode(project))).toBe(project);
  });

  it("returns null for a path that no longer exists", () => {
    expect(decodeProjectDirName("Users-nobody-gone-project")).toBeNull();
    expect(decodeProjectDirName(null)).toBeNull();
  });
});
