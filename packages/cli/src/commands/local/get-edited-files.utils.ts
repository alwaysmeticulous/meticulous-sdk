import { exec } from "child_process";
import { EditedFileWithLines } from "@alwaysmeticulous/client";
import parseDiff from "parse-diff";

export const getGitDiff = (baseSha: string, cwd?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(
      `git diff ${baseSha} --unified=0`,
      { encoding: "utf-8", cwd },
      (error, output) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(output);
      },
    );
  });
};

/**
 * Parse a unified git diff into old-file line ranges per file.
 *
 * Uses old (base) file line numbers so the ranges align with coverage data
 * collected against the base commit. For pure additions, the surrounding lines
 * in the old file are included so the RSE algorithm can find nearby coverage.
 * Pure new files (from === /dev/null) are skipped since the base has no
 * coverage data for them.
 */
export const parseGitDiffToEditedFiles = (
  diff: string,
): EditedFileWithLines[] => {
  const result: EditedFileWithLines[] = [];

  for (const modifiedFile of parseDiff(diff)) {
    const oldName = modifiedFile.from;
    if (!oldName || oldName === "/dev/null") {
      continue;
    }

    const editedRanges: [number, number][] = [];
    let firstDeletedLine: number | null = null;
    let lastDeletedLine: number | null = null;

    for (const chunk of modifiedFile.chunks) {
      let currentOriginalLine = chunk.oldStart - 1;

      for (const change of chunk.changes) {
        if (change.type === "del") {
          firstDeletedLine = firstDeletedLine ?? change.ln;
          lastDeletedLine = change.ln;
          currentOriginalLine = change.ln;
        } else if (change.type === "add") {
          const lineBeforeAddition = currentOriginalLine;
          const lineAfterAddition = currentOriginalLine + 1;

          if (lineBeforeAddition > 0) {
            if (
              !editedRanges.some(
                (r) => r[0] <= lineBeforeAddition && lineBeforeAddition <= r[1],
              )
            ) {
              editedRanges.push([lineBeforeAddition, lineBeforeAddition]);
            }
            if (
              !editedRanges.some(
                (r) => r[0] <= lineAfterAddition && lineAfterAddition <= r[1],
              )
            ) {
              editedRanges.push([lineAfterAddition, lineAfterAddition]);
            }
          }
        } else if (change.type === "normal") {
          currentOriginalLine = change.ln1;

          if (firstDeletedLine !== null && lastDeletedLine !== null) {
            editedRanges.push([firstDeletedLine, lastDeletedLine]);
            firstDeletedLine = null;
            lastDeletedLine = null;
          }
        }
      }
    }

    if (firstDeletedLine !== null && lastDeletedLine !== null) {
      editedRanges.push([firstDeletedLine, lastDeletedLine]);
    }

    result.push({
      filePath: `/${oldName}`,
      editedRanges: normalizeRanges(editedRanges),
    });
  }

  return result;
};

const normalizeRanges = (ranges: [number, number][]): [number, number][] => {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const normalized: [number, number][] = [sorted[0]];
  for (const range of sorted.slice(1)) {
    const last = normalized[normalized.length - 1];
    if (range[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      normalized.push(range);
    }
  }
  return normalized;
};
