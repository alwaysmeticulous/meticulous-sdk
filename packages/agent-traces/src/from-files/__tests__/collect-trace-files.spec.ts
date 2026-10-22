import { symlinkSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { collectTraceFiles } from "../collect/collect-trace-files";
import { writeTree } from "./trace-fixtures";

describe("collectTraceFiles", () => {
  it("crawls directories for trace extensions, skipping node_modules and .git", async () => {
    const root = writeTree({
      "a.jsonl": "",
      "nested/b.json": "",
      "nested/c.txt": "",
      "nested/d.md": "",
      "node_modules/e.jsonl": "",
      ".git/f.json": "",
    });

    const { files, skipped } = await collectTraceFiles([root]);

    expect(files.map((file) => file.path.slice(root.length + 1))).toEqual([
      "a.jsonl",
      "nested/b.json",
      "nested/c.txt",
    ]);
    expect(files.every((file) => !file.explicit)).toBe(true);
    expect(skipped).toEqual([]);
  });

  it("lists a file reached twice once, marked explicit if it was named", async () => {
    const root = writeTree({ "dir/a.jsonl": "{}" });
    symlinkSync(join(root, "dir/a.jsonl"), join(root, "dir/link.jsonl"));

    const { files } = await collectTraceFiles([
      join(root, "dir"),
      join(root, "dir/a.jsonl"),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ explicit: true, sizeBytes: 2 });
  });

  it("doesn't follow symlinked directories", async () => {
    const root = writeTree({ "real/a.jsonl": "", "crawled/b.jsonl": "" });
    symlinkSync(join(root, "real"), join(root, "crawled/linked"));

    const { files } = await collectTraceFiles([join(root, "crawled")]);

    expect(files.map((file) => file.path)).toEqual([
      join(root, "crawled/b.jsonl"),
    ]);
  });

  it("reports paths that don't exist, and takes named files of any extension", async () => {
    const root = writeTree({ "trace.log": "" });

    const { files, skipped } = await collectTraceFiles([
      join(root, "missing.jsonl"),
      join(root, "trace.log"),
    ]);

    expect(skipped).toEqual([
      { path: join(root, "missing.jsonl"), reason: "not found" },
    ]);
    expect(files.map((file) => file.explicit)).toEqual([true]);
  });
});
