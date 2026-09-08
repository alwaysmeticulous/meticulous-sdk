import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode, encode } from "@jridgewell/sourcemap-codec";
import { locateImportRules } from "./css-sourcemap-import-locate";
import type { PlacedStylesheet, RawSourceMap } from "./css-sourcemap-types";

/**
 * Builds one source map for a concatenated CSS asset by shifting each
 * stylesheet's mappings into the position it occupies within that asset.
 *
 * Concatenation places stylesheets side by side, so their individual maps
 * cannot be composed the way a chain of transforms would be — each has to be
 * translated into the asset's coordinate space instead.
 */
export const buildConcatenatedSourcemap = (
  placed: readonly PlacedStylesheet[],
  fileName: string,
  root: string,
): RawSourceMap => {
  const sources: string[] = [];
  const sourcesContent: (string | null)[] = [];

  const sourceIndex = (absolutePath: string, content: string | null) => {
    const relative = toPosix(path.relative(root, absolutePath));
    const existing = sources.indexOf(relative);
    if (existing !== -1) {
      return existing;
    }
    sources.push(relative);
    sourcesContent.push(content);
    return sources.length - 1;
  };

  const lines: [number, number, number, number][][] = [];
  const addSegment = (
    line: number,
    segment: [number, number, number, number],
  ) => {
    while (lines.length <= line) {
      lines.push([]);
    }
    lines[line]?.push(segment);
  };

  for (const { id, stylesheet, line, column, skippedLines, span } of placed) {
    // Only the first line is offset horizontally; later lines start at column 0.
    const shift = (index: number, col: number) =>
      index === 0 ? column + col : col;
    const { map } = stylesheet;
    const decoded = map == null ? null : decode(map.mappings);

    const mappedLines = new Set<number>();
    if (map != null && decoded?.some((segments) => segments.length > 0)) {
      const remapped = map.sources.map((source, index) =>
        sourceIndex(
          resolveSource(id, source),
          map.sourcesContent?.[index] ?? null,
        ),
      );

      // A stylesheet owns exactly the lines it occupies in the asset. Segments
      // past that would land inside the next stylesheet and win its lookups.
      decoded
        .slice(skippedLines, skippedLines + span)
        .forEach((segments, index) => {
          for (const segment of segments) {
            if (segment.length < 4) {
              continue;
            }
            addSegment(line + index, [
              shift(index, segment[0]),
              remapped[segment[1]] ?? 0,
              segment[2],
              segment[3],
            ]);
            mappedLines.add(index);
          }
        });
    }

    // Named imports still sit in the compiled CSS after Lightning reformats
    // them. Locate their selectors and attribute those spans before the
    // entry-file fill claims the rest as utilities.
    const generatedBody = stylesheet.code
      .split("\n")
      .slice(skippedLines, skippedLines + span)
      .join("\n");
    const entryFile = id.split("?")[0] ?? id;
    for (const hit of locateImportRules(
      generatedBody,
      locatableImports(id, entryFile, map),
    )) {
      const importIndex = sourceIndex(hit.absolutePath, hit.content);
      for (let genLine = hit.startLine; genLine <= hit.endLine; genLine++) {
        if (mappedLines.has(genLine)) {
          continue;
        }
        addSegment(line + genLine, [
          shift(genLine, 0),
          importIndex,
          hit.originalLine,
          0,
        ]);
        mappedLines.add(genLine);
      }
    }

    // Preprocessor maps can name every import and still map only a handful of
    // generated positions. Fill the rest line-for-line to this stylesheet so
    // those names do not leave the bulk of the asset unattributed. Clamping
    // keeps generated utilities on the last source line instead of past EOF.
    const index = sourceIndex(id, stylesheet.code);
    const lastLine = Math.max(0, countLines(id) - 1);
    for (let i = 0; i < span; i++) {
      if (mappedLines.has(i)) {
        continue;
      }
      addSegment(line + i, [
        shift(i, 0),
        index,
        Math.min(i + skippedLines, lastLine),
        0,
      ]);
    }
  }

  return {
    version: 3,
    file: path.basename(fileName),
    sources,
    sourcesContent,
    names: [],
    mappings: encode(
      lines.map((segments) => segments.sort((a, b) => a[0] - b[0])),
    ),
  };
};

export const readCombinedSourcemap = (
  get: () => unknown,
): RawSourceMap | null => {
  let map: unknown;
  try {
    map = get();
  } catch {
    // No preprocessor map is available for this stylesheet.
    return null;
  }
  if (!isRawSourceMap(map) || map.mappings === "" || map.sources.length === 0) {
    return null;
  }
  return map;
};

const isRawSourceMap = (value: unknown): value is RawSourceMap =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as RawSourceMap).mappings === "string" &&
  Array.isArray((value as RawSourceMap).sources);

const locatableImports = (
  id: string,
  entryFile: string,
  map: RawSourceMap | null,
) => {
  if (map?.sourcesContent == null) {
    return [];
  }
  const imports = [];
  for (const [index, source] of map.sources.entries()) {
    const content = map.sourcesContent[index];
    if (source == null || content == null || content === "") {
      continue;
    }
    const absolutePath = resolveSource(id, source);
    if (!isLocatableImport(absolutePath, entryFile, source)) {
      continue;
    }
    // Coverage is matched against the repo file. Tailwind's sourcesContent
    // can be a rewritten copy with different line numbers.
    imports.push({
      absolutePath,
      content: readExistingFile(absolutePath) ?? content,
    });
  }
  return imports;
};

const isLocatableImport = (
  absolutePath: string,
  entryFile: string,
  source: string,
): boolean => {
  if (
    source.includes("?transform-only") ||
    absolutePath.includes("?transform-only")
  ) {
    return false;
  }
  const file = absolutePath.split("?")[0] ?? absolutePath;
  if (file === (entryFile.split("?")[0] ?? entryFile)) {
    return false;
  }
  // Tailwind's own index.css is directives, not the generated utilities.
  return !/(?:^|[/\\])node_modules[/\\]tailwindcss[/\\]/.test(file);
};

const resolveSource = (id: string, source: string): string => {
  if (source.startsWith("file://")) {
    try {
      // Not `URL.pathname`, which leaves a Windows path as `/C:/...` and keeps
      // any percent-encoding.
      return fileURLToPath(source);
    } catch {
      // Not a well-formed file URL; fall through and treat it as a path.
    }
  }
  if (path.isAbsolute(source)) {
    return source;
  }
  return path.resolve(path.dirname(id), source);
};

/**
 * Source maps address files with POSIX separators regardless of the platform
 * that produced them, and coverage is matched against repository paths in that
 * same form.
 */
const toPosix = (value: string): string => value.split(path.sep).join("/");

const readExistingFile = (file: string): string | null => {
  try {
    return fs.readFileSync(file.split("?")[0] ?? file, "utf8");
  } catch {
    return null;
  }
};

const countLines = (file: string): number => {
  try {
    return fs.readFileSync(file, "utf8").split("\n").length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};
