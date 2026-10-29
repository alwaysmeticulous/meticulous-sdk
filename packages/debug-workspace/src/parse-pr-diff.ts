/** One file of a unified PR diff, with the line numbers it changed. */
export interface PrDiffFile {
  /** Path in head (new code), or `null` for a deleted file. */
  headPath: string | null;
  /** Path in base (old code), or `null` for an added file. */
  basePath: string | null;
  /** Lines added in head, numbered as in head. */
  addedLines: number[];
  /** Lines removed from base, numbered as in base. */
  removedLines: number[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export const parsePrDiff = (diff: string): PrDiffFile[] => {
  const files: PrDiffFile[] = [];
  let current: PrDiffFile | undefined;
  let inHunk = false;
  let headLine = 0;
  let baseLine = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = {
        headPath: null,
        basePath: null,
        addedLines: [],
        removedLines: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (current == null) {
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      baseLine = Number(hunk[1]);
      headLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (line.startsWith("--- ")) {
        current.basePath = parseDiffPath(line.slice(4), "a/");
      } else if (line.startsWith("+++ ")) {
        current.headPath = parseDiffPath(line.slice(4), "b/");
      }
      continue;
    }
    if (line.startsWith("+")) {
      current.addedLines.push(headLine++);
    } else if (line.startsWith("-")) {
      current.removedLines.push(baseLine++);
    } else if (line.startsWith(" ")) {
      headLine++;
      baseLine++;
    }
  }
  return files.filter((f) => f.headPath != null || f.basePath != null);
};

const parseDiffPath = (path: string, prefix: string): string | null => {
  const trimmed = path.split("\t")[0].trim();
  if (trimmed === "/dev/null") {
    return null;
  }
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
};
