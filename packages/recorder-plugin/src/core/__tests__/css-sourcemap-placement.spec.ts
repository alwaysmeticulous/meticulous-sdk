import type { Rollup } from "vite";
import { describe, expect, it } from "vitest";
import {
  groupStylesheetsByAsset,
  locateStylesheets,
} from "../css-sourcemap-placement";
import type { CompiledStylesheet } from "../css-sourcemap-types";

const stylesheet = (sourcePath: string, code: string): CompiledStylesheet => ({
  sourcePath,
  code,
  map: null,
});

const compiledMap = (
  ...entries: [id: string, code: string][]
): Map<string, CompiledStylesheet> =>
  new Map(entries.map(([id, code]) => [id, stylesheet(id, code)]));

describe("locateStylesheets", () => {
  it("records the line each stylesheet starts on", () => {
    const compiled = compiledMap(
      ["/src/a.css", ".a {\n  color: red;\n}"],
      ["/src/b.css", ".b {\n  color: blue;\n}"],
    );
    const css = ".a {\n  color: red;\n}\n.b {\n  color: blue;\n}\n";

    expect(locateStylesheets(css, compiled)).toMatchObject([
      { id: "/src/a.css", line: 0, column: 0, skippedLines: 0, span: 3 },
      { id: "/src/b.css", line: 3, column: 0, skippedLines: 0, span: 3 },
    ]);
  });

  it("records the column when two stylesheets share a physical line", () => {
    const compiled = compiledMap(["/src/b.css", ".b{color:blue}"]);
    const css = ".a{color:red}.b{color:blue}";

    expect(locateStylesheets(css, compiled)).toMatchObject([
      { id: "/src/b.css", line: 0, column: 13 },
    ]);
  });

  it("skips a stylesheet whose text another plugin rewrote", () => {
    const compiled = compiledMap(
      ["/src/kept.css", ".kept{color:red}"],
      ["/src/rewritten.css", ".gone{color:blue}"],
    );
    const css = ".kept{color:red}\n.rewritten-by-someone-else{}";

    expect(locateStylesheets(css, compiled)).toMatchObject([
      { id: "/src/kept.css", line: 0, column: 0 },
    ]);
  });

  it("gives each of two byte-identical stylesheets its own region", () => {
    const shared = ".shared{color:red}";
    const compiled = compiledMap(
      ["/src/a.css", shared],
      ["/src/b.css", shared],
    );
    const css = `${shared}\n${shared}`;

    expect(locateStylesheets(css, compiled).map(({ line }) => line)).toEqual([
      0, 1,
    ]);
  });

  it("claims the longer stylesheet first when one's CSS contains the other's", () => {
    const short = ".x{color:red}";
    const long = `${short}\n.y{color:blue}`;
    const compiled = compiledMap(
      ["/src/short.css", short],
      ["/src/long.css", long],
    );
    // The long stylesheet is emitted second, so a naive first-match search
    // would hand its opening rule to the short one.
    const css = `${long}\n${short}`;

    expect(locateStylesheets(css, compiled)).toMatchObject([
      { id: "/src/long.css", line: 0, span: 2 },
      { id: "/src/short.css", line: 2, span: 1 },
    ]);
  });

  it("skips a stylesheet whose only match lies inside a claimed region", () => {
    const short = ".x{color:red}";
    const long = `.y{color:blue}\n${short}`;
    const compiled = compiledMap(
      ["/src/short.css", short],
      ["/src/long.css", long],
    );
    // The short stylesheet's text appears only as part of the long one, so
    // claiming it would attribute the long stylesheet's own rule to it.
    const css = long;

    expect(locateStylesheets(css, compiled)).toMatchObject([
      { id: "/src/long.css", line: 0, span: 2 },
    ]);
  });

  describe("when a stylesheet references an emitted asset", () => {
    it("matches it against the substituted URL", () => {
      const compiled = compiledMap([
        "/src/hero.css",
        ".hero{background:url(__VITE_ASSET__a1b2c3__)}",
      ]);
      const css = ".hero{background:url(/assets/hero-D4t9.png)}";

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/hero.css", line: 0, column: 0 },
      ]);
    });

    it("matches a reference carrying a fragment", () => {
      const compiled = compiledMap([
        "/src/icon.css",
        '.icon{background:url("__VITE_ASSET__a1b2c3__$_#icon__")}',
      ]);
      const css = '.icon{background:url("/assets/sprite-D4t9.svg#icon")}';

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/icon.css", line: 0, column: 0 },
      ]);
    });

    it("locates a Tailwind-sized stylesheet without compiling it as a regular expression", () => {
      // Tailwind's @layer properties block is full of grouping characters. The
      // previous implementation compiled the whole captured file into one
      // pattern, which V8 rejected as an invalid regular expression.
      const layer =
        `/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */
@layer properties {
  @supports (((-webkit-hyphens: none)) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color: rgb(from red r g b)))) {
    *, :before, :after, ::backdrop {
      --tw-rotate-x: initial;
      --tw-rotate-y: initial;
      --tw-rotate-z: initial;
    }
  }
}
`.repeat(40);
      const captured = `${layer}.hero{background:url(__VITE_ASSET__a1b2c3__)}`;
      const css = `${layer}.hero{background:url(/assets/hero-D4t9.png)}`;
      const compiled = compiledMap(["/src/tailwind.css", captured]);

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/tailwind.css", line: 0, column: 0 },
      ]);
    });

    it("does not let the pattern run past the url() it belongs to", () => {
      const compiled = compiledMap(
        ["/src/a.css", ".a{background:url(__VITE_ASSET__aaa__)}"],
        ["/src/b.css", ".b{background:url(__VITE_ASSET__bbb__)}"],
      );
      // Both rules land on one line, so a placeholder allowed to match past
      // its own closing paren swallows the next stylesheet's rule as well.
      const css =
        ".a{background:url(/assets/a-D4t9.png)}.b{background:url(/assets/b-Xk21.png)}";

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/a.css", column: 0 },
        { id: "/src/b.css", column: 38 },
      ]);
    });
  });

  describe("when Vite hoists a stylesheet's leading at-rules", () => {
    it("locates the body and counts the hoisted lines", () => {
      const compiled = compiledMap([
        "/src/fonts.css",
        '@import "./base.css";\n.body{color:red}',
      ]);
      // `vite:css-post` lifts the @import to the top of the asset, so the
      // stylesheet's compiled text is no longer contiguous.
      const css = '@import "./base.css";\n.other{color:blue}\n.body{color:red}';

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/fonts.css", line: 2, skippedLines: 1, span: 1 },
      ]);
    });

    it("strips @charset as well as @import", () => {
      const compiled = compiledMap([
        "/src/a.css",
        '@charset "utf-8";\n@import "./base.css";\n.a{color:red}',
      ]);
      const css =
        '@charset "utf-8";\n@import "./base.css";\n.other{}\n.a{color:red}';

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/a.css", line: 3, skippedLines: 2, span: 1 },
      ]);
    });

    it("looks past a banner comment sitting above them", () => {
      const compiled = compiledMap([
        "/src/legacy.css",
        '/* Vendored, do not edit */\n@charset "utf-8";\n.legacy{color:navy}',
      ]);
      // Vite lifts the @charset to the top of the asset and leaves the comment
      // where it was, so the stylesheet is split either side of the comment.
      const css =
        '@charset "utf-8";.other{}\n/* Vendored, do not edit */\n\n.legacy{color:navy}';

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/legacy.css", line: 3, skippedLines: 2, span: 1 },
      ]);
    });

    it("skips a stylesheet left with no body at all", () => {
      const compiled = compiledMap(
        [
          "/src/base.css",
          '@import url("https://cdn.example/base.css");\n.base{color:red}',
        ],
        [
          "/src/fonts.css",
          '@import url("https://cdn.example/inter.css");\n@import url("https://cdn.example/roboto.css");',
        ],
      );
      // Vite runs the hoisted at-rules together onto one line, so the barrel of
      // webfont imports matches neither as a whole nor by its body, of which it
      // has none. Searching for that empty body would match at offset 0 and
      // take the opening of the asset off the stylesheet that owns it.
      const css =
        '@import url("https://cdn.example/base.css");@import url("https://cdn.example/inter.css");@import url("https://cdn.example/roboto.css");\n.base{color:red}';

      expect(locateStylesheets(css, compiled)).toMatchObject([
        { id: "/src/base.css", line: 1, column: 0 },
      ]);
    });
  });
});

describe("groupStylesheetsByAsset", () => {
  const chunk = (
    moduleIds: string[],
    importedCss: string[],
    name = "main",
  ): Rollup.OutputChunk =>
    ({
      type: "chunk",
      name,
      moduleIds,
      viteMetadata: { importedCss: new Set(importedCss) },
    }) as unknown as Rollup.OutputChunk;

  const cssAsset = (name: string) =>
    ({ type: "asset", names: [name] }) as unknown as Rollup.OutputAsset;

  it("maps each asset to the stylesheets of the chunk that imported it", () => {
    const compiled = compiledMap(
      ["/src/a.css", ".a{}"],
      ["/src/b.css", ".b{}"],
    );
    const bundle = {
      "a.js": chunk(["/src/a.ts", "/src/a.css"], ["a.css"]),
      "b.js": chunk(["/src/b.ts", "/src/b.css"], ["b.css"]),
    } as unknown as Rollup.OutputBundle;

    const grouped = groupStylesheetsByAsset(bundle, compiled);

    expect([...(grouped.get("a.css")?.keys() ?? [])]).toEqual(["/src/a.css"]);
    expect([...(grouped.get("b.css")?.keys() ?? [])]).toEqual(["/src/b.css"]);
  });

  it("merges the stylesheets of every chunk importing the same asset", () => {
    const compiled = compiledMap(
      ["/src/a.css", ".a{}"],
      ["/src/b.css", ".b{}"],
    );
    const bundle = {
      "a.js": chunk(["/src/a.css"], ["shared.css"]),
      "b.js": chunk(["/src/b.css"], ["shared.css"]),
    } as unknown as Rollup.OutputBundle;

    expect([
      ...(groupStylesheetsByAsset(bundle, compiled).get("shared.css")?.keys() ??
        []),
    ]).toEqual(["/src/a.css", "/src/b.css"]);
  });

  describe("when a chunk absorbed a pure-CSS chunk's asset", () => {
    // Vite folds a pure-CSS chunk away and merges its asset into whichever
    // chunk imported it, leaving `importedCss` describing more than the
    // importer's own modules account for.
    const bundle = {
      "main.js": chunk(["/src/a.css"], ["main.css", "folded.css"]),
      "main.css": cssAsset("main.css"),
      "folded.css": cssAsset("folded.css"),
    } as unknown as Rollup.OutputBundle;
    const compiled = compiledMap(["/src/a.css", ".a{}"]);

    it("keeps the chunk's own asset", () => {
      expect([
        ...(groupStylesheetsByAsset(bundle, compiled).get("main.css")?.keys() ??
          []),
      ]).toEqual(["/src/a.css"]);
    });

    it("leaves the absorbed asset to be searched against every stylesheet", () => {
      expect(groupStylesheetsByAsset(bundle, compiled).has("folded.css")).toBe(
        false,
      );
    });
  });

  it("claims nothing when the chunk's own asset cannot be identified", () => {
    const bundle = {
      "main.js": chunk(["/src/a.css"], ["one.css", "two.css"]),
      "one.css": cssAsset("other.css"),
      "two.css": cssAsset("another.css"),
    } as unknown as Rollup.OutputBundle;

    expect(
      groupStylesheetsByAsset(bundle, compiledMap(["/src/a.css", ".a{}"])).size,
    ).toBe(0);
  });

  it("ignores a chunk whose own modules include no stylesheet", () => {
    const bundle = {
      "main.js": chunk(["/src/main.ts"], ["folded.css"]),
      "folded.css": cssAsset("folded.css"),
    } as unknown as Rollup.OutputBundle;

    expect(
      groupStylesheetsByAsset(bundle, compiledMap(["/src/a.css", ".a{}"])).size,
    ).toBe(0);
  });

  it("ignores assets and chunks that claim no CSS", () => {
    const compiled = compiledMap(["/src/a.css", ".a{}"]);
    const bundle = {
      "a.js": { type: "chunk", moduleIds: ["/src/a.css"] },
      "a.css": { type: "asset" },
    } as unknown as Rollup.OutputBundle;

    expect(groupStylesheetsByAsset(bundle, compiled).size).toBe(0);
  });
});
