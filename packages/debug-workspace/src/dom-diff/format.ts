import {
  structuredPatch,
  createTwoFilesPatch,
  type StructuredPatchHunk as Hunk,
} from "diff";
import { html as beautifyHtml } from "js-beautify";

export type { Hunk };

/**
 * Pretty-prints a DOM for diffing.
 *
 * Leading whitespace is stripped from every line so indentation is
 * ignored by the subsequent diff: two DOMs whose only difference is a
 * wrapping element that changes indentation depth for unrelated
 * elements won't emit spurious hunks.
 */
export const formatDomForDiff = (dom: string): string => {
  const beautified = beautifyHtml(dom, {
    indent_size: 2,
    wrap_line_length: 0,
    inline: [],
  });
  return beautified
    .split("\n")
    .map((line) => line.replace(/^\s+/, ""))
    .join("\n");
};

export const computeCanonicalHunks = (base: string, head: string): Hunk[] => {
  const patch = structuredPatch("base", "head", base, head, "", "", {
    context: 0,
  });
  return patch.hunks;
};

export const formatHunkLines = (hunk: Hunk): string => hunk.lines.join("\n");

export const addContextToHunks = (
  hunks: Hunk[],
  base: string,
  _head: string,
  contextLines: number,
): Hunk[] => {
  if (hunks.length === 0) {
    return [];
  }

  const baseLines = base.split("\n");

  return hunks.map((hunk) => {
    const preLinesAvailable = Math.min(contextLines, hunk.oldStart - 1);
    const baseEndOfChange = hunk.oldStart - 1 + hunk.oldLines;
    const postLinesAvailable = Math.min(
      contextLines,
      Math.max(0, baseLines.length - baseEndOfChange),
    );

    const preContext = baseLines
      .slice(hunk.oldStart - 1 - preLinesAvailable, hunk.oldStart - 1)
      .map((l) => ` ${l}`);

    const postContext = baseLines
      .slice(baseEndOfChange, baseEndOfChange + postLinesAvailable)
      .map((l) => ` ${l}`);

    return {
      oldStart: hunk.oldStart - preLinesAvailable,
      oldLines: hunk.oldLines + preLinesAvailable + postLinesAvailable,
      newStart: hunk.newStart - preLinesAvailable,
      newLines: hunk.newLines + preLinesAvailable + postLinesAvailable,
      lines: [...preContext, ...hunk.lines, ...postContext],
    } satisfies Hunk;
  });
};

export const computeFullContextDiff = (base: string, head: string): string => {
  if (base === head) {
    return base
      .split("\n")
      .map((line) => ` ${line}`)
      .join("\n");
  }

  const fullPatch = createTwoFilesPatch("base", "head", base, head, "", "", {
    context: Number.POSITIVE_INFINITY,
  });

  return fullPatch
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("---") &&
        !line.startsWith("+++") &&
        !line.startsWith("@@") &&
        line !== "\\ No newline at end of file" &&
        !line.startsWith("Index: ") &&
        !/^=+$/.test(line),
    )
    .join("\n");
};
