import { describe, expect, test } from "vitest";
import { parseGitDiffToEditedFiles } from "./get-edited-files.utils";

describe("parseGitDiffToEditedFiles", () => {
  test("handles simple deletions", () => {
    const diff = `
diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -10,4 +10,2 @@
 const a = 1;
-const b = 2;
-const c = 3;
 const d = 4;`;

    const result = parseGitDiffToEditedFiles(diff);
    expect(result[0].filePath).toBe("file.js");
    expect(result[0].editedRanges).toEqual([[11, 12]]);
  });

  test("handles additions with context lines", () => {
    const diff = `
diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -10,2 +10,3 @@
 const a = 1;
+const newLine = 'added';
 const b = 2;`;

    const result = parseGitDiffToEditedFiles(diff);
    expect(result[0].filePath).toBe("file.js");
    // Should include line before (10) and after (11) the addition
    expect(result[0].editedRanges).toContainEqual([10, 11]);
  });

  test("handles mixed additions and deletions", () => {
    const diff = `
diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -10,3 +10,3 @@
 const a = 1;
-const b = 2;
+const newB = 2;
 const c = 3;`;

    const result = parseGitDiffToEditedFiles(diff);
    expect(result[0].editedRanges).toEqual(expect.arrayContaining([[11, 12]]));
  });

  test("handles multiple chunks", () => {
    const diff = `
diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -5,1 +5,2 @@
 const x = 5;
+const y = 6;
@@ -20,2 +21,1 @@
-const z = 10;
 const w = 11;`;

    const result = parseGitDiffToEditedFiles(diff);
    expect(result[0].editedRanges).toEqual(
      expect.arrayContaining([
        [5, 6],
        [20, 20],
      ]),
    );
  });

  test("skips new files with no old content", () => {
    const newFileDiff = `
diff --git a/newfile.js b/newfile.js
new file mode 100644
index 0000000..abcdefg
--- /dev/null
+++ b/newfile.js
@@ -0,0 +1,3 @@
+const a = 1;
+const b = 2;
+const c = 3;`;

    const result = parseGitDiffToEditedFiles(newFileDiff);
    // New files have no base coverage data to match against, so they are skipped
    expect(result).toHaveLength(0);
  });

  test("handles non-contiguous deletions with interspersed additions", () => {
    const diff = `
diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -6,4 +6,3 @@
-const deletedLine0 = 'removed';
+const addedLine1 = 'new';
+const addedLine2 = 'new';
-const deletedLine1 = 'removed';
-const deletedLine2 = 'removed';
 const end = 3;`;

    const result = parseGitDiffToEditedFiles(diff);
    expect(result[0].editedRanges).toEqual(expect.arrayContaining([[6, 8]]));
  });
});
