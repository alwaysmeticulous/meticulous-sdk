import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createZipFromFolder } from "../asset-upload-utils";

describe("createZipFromFolder", () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zip-test-"));
    outputDir = mkdtempSync(join(tmpdir(), "zip-output-"));

    // Create test files
    for (let i = 0; i < 20; i++) {
      writeFileSync(join(tempDir, `file-${i}.txt`), `content ${i}`);
    }
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  it("should create a valid zip file", async () => {
    const zipPath = join(outputDir, "test.zip");
    await createZipFromFolder(tempDir, zipPath);

    expect(existsSync(zipPath)).toBe(true);
    expect(statSync(zipPath).size).toBeGreaterThan(0);
  });

  it("should not throw EBADF when run many times in parallel", async () => {
    // Run 100 times in parallel to stress test the file descriptor handling.
    // Before the fix (autoClose: false), this would intermittently fail with:
    // "EBADF: bad file descriptor, fsync"
    const promises = Array.from({ length: 100 }, (_, i) =>
      createZipFromFolder(tempDir, join(outputDir, `test-${i}.zip`))
    );

    await Promise.all(promises);

    // Verify all zips were created
    for (let i = 0; i < 100; i++) {
      expect(existsSync(join(outputDir, `test-${i}.zip`))).toBe(true);
    }
  });
});
