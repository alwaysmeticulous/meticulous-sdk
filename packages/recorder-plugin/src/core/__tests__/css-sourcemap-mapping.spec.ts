import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode, encode } from "@jridgewell/sourcemap-codec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildConcatenatedSourcemap } from "../css-sourcemap-mapping";
import type { PlacedStylesheet, RawSourceMap } from "../css-sourcemap-types";

const placedStylesheet = ({
  id,
  code = ".rule{}",
  map = null,
  line,
  column = 0,
  skippedLines = 0,
  span,
}: {
  id: string;
  code?: string;
  map?: RawSourceMap | null;
  line: number;
  column?: number;
  skippedLines?: number;
  span: number;
}): PlacedStylesheet => ({
  id,
  stylesheet: { sourcePath: id.split("?")[0] ?? id, code, map },
  line,
  column,
  skippedLines,
  span,
});

interface Segment {
  column: number;
  source: string;
  line: number;
}

/** The emitted mappings, per generated line, with sources named rather than indexed. */
const segmentsByLine = (map: RawSourceMap): Segment[][] =>
  decode(map.mappings).map((segments) =>
    segments.flatMap(([column, sourceIndex, line]) =>
      sourceIndex == null || line == null
        ? []
        : [{ column, source: map.sources[sourceIndex] ?? "", line }],
    ),
  );

describe("buildConcatenatedSourcemap", () => {
  describe("when a stylesheet was compiled by a preprocessor", () => {
    /** One segment per compiled line, each pointing at a line of its own. */
    const lineForLineMap = (source: string, lines: number): RawSourceMap => ({
      version: 3,
      sources: [source],
      mappings: encode(
        Array.from(
          { length: lines },
          (_, index) =>
            [[0, 0, index, 0]] as [number, number, number, number][],
        ),
      ),
    });

    it("keeps its mappings within the lines it occupies in the asset", () => {
      // Sass hands back a map for the whole file, including the `@import` Vite
      // then hoists to the top of the asset. What is left behind occupies fewer
      // lines than the map describes.
      const theme = placedStylesheet({
        id: "/repo/src/theme.scss",
        map: lineForLineMap("theme.scss", 4),
        line: 4,
        skippedLines: 1,
        span: 2,
      });
      const next = placedStylesheet({
        id: "/repo/src/next.css",
        line: 6,
        span: 2,
      });

      const lines = segmentsByLine(
        buildConcatenatedSourcemap([theme, next], "app.css", "/repo"),
      );

      // The body starts at the map's second line, the first having gone with
      // the hoisted at-rule.
      expect(lines[4]).toEqual([
        { column: 0, source: "src/theme.scss", line: 1 },
      ]);
      expect(lines[5]).toEqual([
        { column: 0, source: "src/theme.scss", line: 2 },
      ]);
      // Segments past the span would land inside the next stylesheet and win
      // its lookups, handing one file's coverage to another.
      expect(lines[6]).toEqual([
        { column: 0, source: "src/next.css", line: 0 },
      ]);
      expect(lines[7]).toEqual([
        { column: 0, source: "src/next.css", line: 1 },
      ]);
    });
  });

  describe("when a stylesheet has no preprocessor map", () => {
    let dir: string;

    beforeAll(() => {
      dir = realpathSync(mkdtempSync(join(tmpdir(), "css-sourcemap-mapping-")));
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("holds generated lines to the last line of the source file", () => {
      // Tailwind expands one directive into as many lines of utilities as the
      // project uses, none of which the source spells out. Walking past the end
      // of the file would point them at lines that do not exist.
      const id = join(dir, "utilities.css");
      writeFileSync(id, "@tailwind utilities;");

      const lines = segmentsByLine(
        buildConcatenatedSourcemap(
          [placedStylesheet({ id, line: 0, span: 4 })],
          "app.css",
          dir,
        ),
      );

      expect(lines).toEqual([
        [{ column: 0, source: "utilities.css", line: 0 }],
        [{ column: 0, source: "utilities.css", line: 0 }],
        [{ column: 0, source: "utilities.css", line: 0 }],
        [{ column: 0, source: "utilities.css", line: 0 }],
      ]);
    });
  });

  it("offsets a stylesheet's opening line by the column it starts at", () => {
    // Vite can run one stylesheet's last line and the next stylesheet's first
    // onto a single physical line, so only the opening line is indented.
    const first = placedStylesheet({
      id: "/repo/src/first.css",
      line: 0,
      span: 1,
    });
    const second = placedStylesheet({
      id: "/repo/src/second.css",
      line: 0,
      column: 13,
      span: 2,
    });

    const lines = segmentsByLine(
      buildConcatenatedSourcemap([first, second], "app.css", "/repo"),
    );

    expect(lines[0]).toEqual([
      { column: 0, source: "src/first.css", line: 0 },
      { column: 13, source: "src/second.css", line: 0 },
    ]);
    expect(lines[1]).toEqual([
      { column: 0, source: "src/second.css", line: 1 },
    ]);
  });
});
