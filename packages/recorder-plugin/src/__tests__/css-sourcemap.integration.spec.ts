import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "@jridgewell/sourcemap-codec";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { build, type Plugin, type Rollup } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CssSourcemapOptions } from "../core/css-sourcemap";
import CssSourcemapPlugin from "../css-sourcemap";

let dir: string;

const write = (relativePath: string, contents: string): void => {
  const target = join(dir, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
};

const writeProject = (): void => {
  write(
    "src/banner.css",
    ".banner {\n  background: #eee;\n}\n.banner-dead {\n  color: hotpink;\n}\n",
  );
  write("src/widget.css", ".widget {\n  border: 1px solid #ccc;\n}\n");
  write("src/Button.module.css", ".button {\n  padding: 8px;\n}\n");
  write(
    "src/main.ts",
    [
      'import "./banner.css";',
      'import "./widget.css";',
      'import styles from "./Button.module.css";',
      "document.body.className = `banner widget ${styles.button}`;",
    ].join("\n"),
  );
  write(
    "index.html",
    '<!doctype html><html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>',
  );
};

let warnings: string[];

const runBuild = async (
  options?: CssSourcemapOptions,
  extra?: { plugins?: Plugin[]; assetsInlineLimit?: number },
): Promise<void> => {
  await build({
    root: dir,
    configFile: false,
    logLevel: "silent",
    plugins: [...(extra?.plugins ?? []), CssSourcemapPlugin(options)],
    build: {
      write: true,
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        onwarn: (warning) => {
          warnings.push(warning.message);
        },
      },
      ...(extra?.assetsInlineLimit == null
        ? {}
        : { assetsInlineLimit: extra.assetsInlineLimit }),
    },
  });
};

/** Warnings raised by this plugin, ignoring anything Vite itself reported. */
const pluginWarnings = (): string[] =>
  warnings.filter((message) => /stylesheet|CSS minification/i.test(message));

interface EmittedSourceMap {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
}

const readMap = (fileName: string): EmittedSourceMap =>
  JSON.parse(
    readFileSync(join(assetsDir(), `${fileName}.map`), "utf8"),
  ) as EmittedSourceMap;

/** Every stylesheet reachable by tracing each line of the asset. */
const reachableSources = (css: string, map: EmittedSourceMap): Set<string> => {
  const tracer = new TraceMap(map);
  const resolved = new Set<string>();
  for (let line = 1; line <= css.split("\n").length; line++) {
    const { source } = originalPositionFor(tracer, { line, column: 0 });
    if (source != null) {
      resolved.add(source);
    }
  }
  return resolved;
};

/** Resolves once the watcher has finished the build it is currently running. */
const nextBundle = (watcher: Rollup.RollupWatcher): Promise<void> =>
  new Promise((resolve, reject) => {
    const handler = (event: { code: string; error?: unknown }): void => {
      if (event.code !== "END" && event.code !== "ERROR") {
        return;
      }
      clearTimeout(timer);
      watcher.off("event", handler);
      if (event.code === "ERROR") {
        const { error } = event;
        reject(error instanceof Error ? error : new Error(String(error)));
      } else {
        resolve();
      }
    };
    const timer = setTimeout(() => {
      watcher.off("event", handler);
      reject(new Error("timed out waiting for the watcher to finish a build"));
    }, 20_000);
    watcher.on("event", handler);
  });

const assetsDir = () => join(dir, "dist/assets");

const readCssAsset = (): { css: string; fileName: string } => {
  const fileName = readdirSync(assetsDir()).find((file) =>
    file.endsWith(".css"),
  );
  if (fileName == null) {
    throw new Error("build produced no CSS asset");
  }
  return { css: readFileSync(join(assetsDir(), fileName), "utf8"), fileName };
};

beforeEach(() => {
  // realpathSync resolves the macOS /var -> /private/var symlink, otherwise
  // the emitted source paths are relative to a different root than the project.
  dir = realpathSync(mkdtempSync(join(tmpdir(), "recorder-plugin-css-")));
  warnings = [];
  writeProject();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("CSS sourcemap plugin integration", () => {
  it("emits a sibling source map and references it from the asset", async () => {
    await runBuild();

    const { css, fileName } = readCssAsset();
    expect(readdirSync(assetsDir())).toContain(`${fileName}.map`);
    expect(css).toContain(`/*# sourceMappingURL=${fileName}.map */`);
  });

  it("records every stylesheet, relative to the project root", async () => {
    await runBuild();

    const { fileName } = readCssAsset();
    const map = readMap(fileName);

    expect(map.sources.sort()).toEqual([
      "src/Button.module.css",
      "src/banner.css",
      "src/widget.css",
    ]);
  });

  it("makes source paths relative to an explicit root", async () => {
    await runBuild({ root: join(dir, "src") });

    const { fileName } = readCssAsset();
    const map = readMap(fileName);

    expect(map.sources.sort()).toEqual([
      "Button.module.css",
      "banner.css",
      "widget.css",
    ]);
  });

  // Listing every stylesheet under `sources` is not sufficient on its own: a
  // map can name them all and still resolve every position to the first one.
  it("resolves a position back to the stylesheet the rule came from", async () => {
    await runBuild();

    const { css, fileName } = readCssAsset();
    const tracer = new TraceMap(readMap(fileName));
    const lines = css.split("\n");

    const expectations: [string, string][] = [
      [".banner ", "src/banner.css"],
      [".widget", "src/widget.css"],
      ["_button_", "src/Button.module.css"],
    ];

    for (const [selector, expectedSource] of expectations) {
      const line = lines.findIndex((text) => text.includes(selector));
      expect(line, `no rule containing "${selector}"`).toBeGreaterThan(-1);

      const position = originalPositionFor(tracer, {
        line: line + 1,
        column: lines[line]?.indexOf(selector) ?? 0,
      });

      expect(
        position.source,
        `"${selector}" resolved to the wrong stylesheet`,
      ).toBe(expectedSource);
    }
  });

  it("distinguishes each stylesheet rather than collapsing onto one", async () => {
    await runBuild();

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);
    const tracer = new TraceMap(map);

    const resolved = new Set<string>();
    for (let line = 1; line <= css.split("\n").length; line++) {
      const { source } = originalPositionFor(tracer, { line, column: 0 });
      if (source != null) {
        resolved.add(source);
      }
    }

    expect(resolved.size).toBe(map.sources.length);
  });

  it("keeps stylesheets apart when they compile to identical CSS", async () => {
    write("src/token-a.css", ".shared {\n  color: #123456;\n}\n");
    write("src/token-b.css", ".shared {\n  color: #123456;\n}\n");
    write(
      "src/main.ts",
      ['import "./token-a.css";', 'import "./token-b.css";'].join("\n"),
    );

    await runBuild();

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);
    const tracer = new TraceMap(map);

    const resolved = new Set<string>();
    for (let line = 1; line <= css.split("\n").length; line++) {
      const { source } = originalPositionFor(tracer, { line, column: 0 });
      if (source != null) {
        resolved.add(source);
      }
    }

    // Both stylesheets have to stay reachable; claiming the same occurrence
    // twice would silently attribute one file's coverage to the other.
    expect(resolved).toEqual(new Set(["src/token-a.css", "src/token-b.css"]));
  });

  it("keeps stylesheets that reference an emitted asset", async () => {
    // A stylesheet's `url()` is still an unresolved placeholder when the plugin
    // captures it, and Vite substitutes the hashed URL afterwards. Searching
    // the finished asset for the captured text verbatim would never find this
    // stylesheet, dropping every rule in a file that uses a font or image.
    writeFileSync(join(dir, "src/dot.png"), Buffer.alloc(8192, 7));
    write(
      "src/sprite.svg",
      `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="star"/></svg>\n`,
    );
    write(
      "src/hero.css",
      '.hero {\n  background: url("./dot.png");\n}\n.hero-caption {\n  font-size: 12px;\n}\n',
    );
    // A reference carrying a fragment or query is held in a different shape of
    // placeholder than a bare one.
    write(
      "src/sprite.css",
      '.sprite {\n  background: url("./sprite.svg#star");\n}\n.sprite-label {\n  font-weight: 700;\n}\n',
    );
    write(
      "src/main.ts",
      [
        'import "./banner.css";',
        'import "./hero.css";',
        'import "./sprite.css";',
      ].join("\n"),
    );

    // Emit the image as a file rather than inlining it, which is what happens
    // to any real font or image over Vite's inlining threshold.
    await runBuild(undefined, { assetsInlineLimit: 0 });

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);

    expect(css).toContain("url(");
    expect(css).not.toContain("__VITE_ASSET__");
    expect(map.sources).toContain("src/hero.css");
    expect(map.sources).toContain("src/sprite.css");

    const reachable = reachableSources(css, map);
    expect(reachable).toContain("src/hero.css");
    expect(reachable).toContain("src/sprite.css");
  });

  it("keeps stylesheets apart when one's CSS contains the other's", async () => {
    const shared = ".shared {\n  color: #123456;\n}\n";
    write("src/subset.css", shared);
    write("src/superset.css", `.lead {\n  margin: 0;\n}\n${shared}`);
    write(
      "src/main.ts",
      ['import "./superset.css";', 'import "./subset.css";'].join("\n"),
    );

    await runBuild();

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);

    // Claiming a start offset rather than a whole region would let the shorter
    // stylesheet take a position inside the longer one, so the longer one
    // either goes missing or inherits the shorter one's coverage.
    expect(reachableSources(css, map)).toEqual(
      new Set(["src/subset.css", "src/superset.css"]),
    );

    const lines = css.split("\n");
    const leadLine = lines.findIndex((text) => text.includes(".lead"));
    expect(
      originalPositionFor(new TraceMap(map), {
        line: leadLine + 1,
        column: lines[leadLine]?.indexOf(".lead") ?? 0,
      }).source,
    ).toBe("src/superset.css");
  });

  it("captures styles declared inside a single-file component", async () => {
    // Framework plugins hand styles to Vite under an id whose extension lives
    // in the query, e.g. `App.vue?vue&type=style&index=0&lang.css`.
    write("src/App.vue", "<template><div /></template>\n");
    write("src/main.ts", 'import "./App.vue";');

    const styleId = `${join(dir, "src/App.vue")}?vue&type=style&index=0&lang.css`;
    const singleFileComponent: Plugin = {
      name: "test:single-file-component",
      resolveId: (id) => (id === styleId ? id : null),
      load: (id) => {
        if (id === styleId) {
          return ".sfc-card {\n  border: 1px solid teal;\n}\n";
        }
        return id.endsWith("App.vue")
          ? `import ${JSON.stringify(styleId)};`
          : null;
      },
    };

    await runBuild(undefined, { plugins: [singleFileComponent] });

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);

    expect(css).toContain(".sfc-card");
    expect(map.sources).toContain("src/App.vue");
    expect(reachableSources(css, map)).toContain("src/App.vue");
  });

  it("keeps a stylesheet whose leading at-rules get hoisted", async () => {
    // Vite lifts `@import` and `@charset` to the top of the concatenated file.
    // A stylesheet that opens with one — a webfont, typically — is therefore
    // split in two, and its compiled text never appears as a single run.
    write(
      "src/fonts.css",
      [
        // Semicolons inside the URL are how a webfont asks for several
        // weights, so the at-rule cannot be taken to end at the first one.
        '@import url("https://fonts.example/css2?family=Inter:wght@400;700");',
        "",
        ".font-body {",
        "  font-family: Inter, sans-serif;",
        "}",
      ].join("\n"),
    );
    write(
      "src/main.ts",
      ['import "./banner.css";', 'import "./fonts.css";'].join("\n"),
    );

    await runBuild();

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);
    const lines = css.split("\n");

    expect(lines[0]).toContain("@import");
    expect(map.sources).toContain("src/fonts.css");

    // The rules have to keep pointing at their original lines even though the
    // at-rule above them was moved elsewhere.
    const line = lines.findIndex((text) => text.includes(".font-body"));
    expect(line, "no .font-body rule in the built CSS").toBeGreaterThan(-1);
    expect(
      originalPositionFor(new TraceMap(map), {
        line: line + 1,
        column: lines[line]?.indexOf(".font-body") ?? 0,
      }),
    ).toMatchObject({ source: "src/fonts.css", line: 3 });
  });

  it("keeps a stylesheet whose hoisted at-rule sits below a banner comment", async () => {
    // A licence banner above the at-rules is routine in vendored CSS. Vite
    // lifts the @charset out and leaves the comment where it was, so a scan
    // that stops at the comment never reaches the at-rule behind it and the
    // whole stylesheet drops out of the map.
    write(
      "src/legacy.css",
      [
        "/* Vendored from acme-ui v3.2.0, do not edit */",
        '@charset "utf-8";',
        ".legacy-card {",
        "  border: 1px solid navy;",
        "}",
        "",
      ].join("\n"),
    );
    write(
      "src/main.ts",
      ['import "./banner.css";', 'import "./legacy.css";'].join("\n"),
    );

    await runBuild();

    const { css, fileName } = readCssAsset();
    const map = readMap(fileName);
    const lines = css.split("\n");

    expect(map.sources).toContain("src/legacy.css");

    const line = lines.findIndex((text) => text.includes(".legacy-card"));
    expect(line, "no .legacy-card rule in the built CSS").toBeGreaterThan(-1);
    expect(
      originalPositionFor(new TraceMap(map), {
        line: line + 1,
        column: lines[line]?.indexOf(".legacy-card") ?? 0,
      }),
    ).toMatchObject({ source: "src/legacy.css", line: 3 });
  });

  describe("when a stylesheet is nothing but imports", () => {
    // A barrel of webfont imports has no rules of its own. Vite runs its
    // at-rules together with every other stylesheet's at the top of the asset,
    // leaving the barrel with no body to be found anywhere in it.
    const writeFontBarrel = (): void => {
      write(
        "src/base.css",
        '@import url("https://cdn.example/base.css");\n.base {\n  color: red;\n}\n',
      );
      write(
        "src/fonts.css",
        [
          '@import url("https://cdn.example/inter.css");',
          '@import url("https://cdn.example/roboto.css");',
          "",
        ].join("\n"),
      );
      write(
        "src/main.ts",
        ['import "./base.css";', 'import "./fonts.css";'].join("\n"),
      );
    };

    it("leaves the top of the asset to the stylesheet that opens it", async () => {
      writeFontBarrel();

      await runBuild();

      const { css, fileName } = readCssAsset();
      // The asset opens with base.css's own hoisted import. An empty body is
      // found at that offset, which would take the line off base.css.
      expect(css.split("\n")[0]).toContain("cdn.example/base.css");
      expect(reachableSources(css, readMap(fileName))).toEqual(
        new Set(["src/base.css"]),
      );
    });

    it("stays quiet about it", async () => {
      writeFontBarrel();

      await runBuild();

      expect(pluginWarnings()).toEqual([]);
    });
  });

  describe("when a rebuild reuses the plugin instance", () => {
    const buildWith = async (plugins: Plugin[]): Promise<void> => {
      await build({
        root: dir,
        configFile: false,
        logLevel: "silent",
        plugins,
        build: {
          write: true,
          outDir: "dist",
          emptyOutDir: true,
          rollupOptions: {
            onwarn: (warning) => {
              warnings.push(warning.message);
            },
          },
        },
      });
    };

    /**
     * Imports a stylesheet for its URL, whose asset no chunk claims and which
     * is therefore searched against every stylesheet the plugin has recorded.
     */
    const writeLinkedStylesheet = (name: string): void => {
      write(`src/${name}.css`, ".linked-rule {\n  color: maroon;\n}\n");
      write(
        "src/main.ts",
        [
          'import "./banner.css";',
          `import linked from "./${name}.css?url";`,
          "console.log(linked);",
        ].join("\n"),
      );
    };

    it("forgets a stylesheet the new build no longer has", async () => {
      const plugins = CssSourcemapPlugin();
      writeLinkedStylesheet("old-theme");
      await buildWith(plugins);

      rmSync(join(dir, "src/old-theme.css"));
      writeLinkedStylesheet("new-theme");
      await buildWith(plugins);

      // The renamed file compiles to the same CSS as the one it replaced, so a
      // stale record of the old path matches the new asset and hands its
      // coverage to a file that is no longer in the repository.
      const mapFileName = readdirSync(assetsDir()).find(
        (file) => file.startsWith("new-theme") && file.endsWith(".css.map"),
      );
      expect(
        mapFileName,
        "no source map for the renamed stylesheet",
      ).toBeDefined();
      expect(
        JSON.parse(readFileSync(join(assetsDir(), mapFileName ?? ""), "utf8")),
      ).toMatchObject({ sources: ["src/new-theme.css"] });
    });

    it("keeps a stylesheet the rebuild never recompiled", async () => {
      write(
        "src/main.ts",
        ['import "./banner.css";', 'import "./widget.css";'].join("\n"),
      );

      const watcher = (await build({
        root: dir,
        configFile: false,
        logLevel: "silent",
        plugins: [CssSourcemapPlugin()],
        build: {
          write: true,
          outDir: "dist",
          emptyOutDir: true,
          watch: {},
          rollupOptions: {
            onwarn: (warning) => {
              warnings.push(warning.message);
            },
          },
        },
      })) as Rollup.RollupWatcher;

      try {
        await nextBundle(watcher);

        // Rollup's watch cache skips `transform` for a module that has not
        // changed, so what the first build recorded is all the second one ever
        // sees of these stylesheets.
        const rebuilt = nextBundle(watcher);
        write(
          "src/main.ts",
          [
            'import "./banner.css";',
            'import "./widget.css";',
            "document.title = `rebuilt`;",
          ].join("\n"),
        );
        await rebuilt;

        const { css, fileName } = readCssAsset();
        expect(reachableSources(css, readMap(fileName))).toEqual(
          new Set(["src/banner.css", "src/widget.css"]),
        );
      } finally {
        await watcher.close();
      }
    });
  });

  it("attributes identical stylesheets in split assets to their own file", async () => {
    const shared = ".shared-widget {\n  color: #abcdef;\n}\n";
    write("src/alpha.css", shared);
    write("src/beta.css", shared);
    write("src/a-only.css", ".only-a {\n  margin: 1px;\n}\n");
    write("src/b-only.css", ".only-b {\n  margin: 2px;\n}\n");
    write("src/entry-a.ts", 'import "./a-only.css";\nimport "./alpha.css";');
    write("src/entry-b.ts", 'import "./b-only.css";\nimport "./beta.css";');

    await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [CssSourcemapPlugin()],
      build: {
        write: true,
        outDir: "dist",
        emptyOutDir: true,
        cssCodeSplit: true,
        rollupOptions: {
          input: {
            a: join(dir, "src/entry-a.ts"),
            b: join(dir, "src/entry-b.ts"),
          },
        },
      },
    });

    // Searching every stylesheet in every asset would let one entry's
    // stylesheet claim the identical region in the other entry's asset,
    // leaving its twin unmapped and its coverage on the wrong file.
    for (const [entry, expected] of [
      ["a-", "src/alpha.css"],
      ["b-", "src/beta.css"],
    ]) {
      const fileName = readdirSync(assetsDir()).find(
        (file) => file.startsWith(entry) && file.endsWith(".css"),
      );
      expect(fileName, `no CSS asset for entry ${entry}`).toBeDefined();

      const css = readFileSync(join(assetsDir(), fileName!), "utf8");
      const map = readMap(fileName!);
      const lines = css.split("\n");
      const line = lines.findIndex((text) => text.includes(".shared-widget"));

      expect(
        originalPositionFor(new TraceMap(map), { line: line + 1, column: 0 })
          .source,
      ).toBe(expected);
    }
  });

  it("attributes an absorbed pure-CSS chunk's asset to its own file", async () => {
    const shared = ".shared-rule {\n  color: #abcdef;\n}\n";
    write("src/own.css", shared);
    write("src/folded.css", `.folded-only {\n  margin: 3px;\n}\n${shared}`);
    write("src/folded.ts", 'import "./folded.css";');
    write("src/entry.ts", 'import "./own.css";\nimport "./folded.ts";');

    await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [CssSourcemapPlugin()],
      build: {
        write: true,
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
          input: { entry: join(dir, "src/entry.ts") },
          output: {
            manualChunks: (id: string) =>
              id.includes("folded") ? "folded" : undefined,
          },
        },
      },
    });

    // Vite folds the pure-CSS chunk away and adds its asset to the importing
    // chunk's `importedCss`, whose own modules do not account for it. Treating
    // that as ownership hands the folded asset's rules to the importer's
    // stylesheet and leaves the folded one unmapped entirely.
    for (const [prefix, expected] of [
      ["entry", "src/own.css"],
      ["folded", "src/folded.css"],
    ]) {
      const fileName = readdirSync(assetsDir()).find(
        (file) => file.startsWith(prefix) && file.endsWith(".css"),
      );
      expect(fileName, `no CSS asset for ${prefix}`).toBeDefined();

      const css = readFileSync(join(assetsDir(), fileName!), "utf8");
      const line = css
        .split("\n")
        .findIndex((text) => text.includes(".shared-rule"));

      expect(
        originalPositionFor(new TraceMap(readMap(fileName!)), {
          line: line + 1,
          column: 0,
        }).source,
      ).toBe(expected);
    }
  });

  it("emits nothing when disabled", async () => {
    await runBuild({ enabled: false });

    const { css } = readCssAsset();
    expect(readdirSync(assetsDir()).some((file) => file.endsWith(".map"))).toBe(
      false,
    );
    expect(css).not.toContain("sourceMappingURL");
  });

  describe("when minification is kept on", () => {
    // A stylesheet already written in minified form survives minification
    // byte-for-byte, so it can still be located in the rewritten asset. Without
    // an explicit check the plugin emits a map covering only that stylesheet
    // and quietly attributes its neighbours' rules to it.
    const writeMinificationProofStylesheet = (): void => {
      write("src/dense.css", ".dense{border:1px solid #ccc}\n");
      write(
        "src/main.ts",
        [
          'import "./banner.css";',
          'import "./widget.css";',
          'import "./dense.css";',
          "document.body.className = `banner widget dense`;",
        ].join("\n"),
      );
    };

    it("emits no source map", async () => {
      writeMinificationProofStylesheet();
      await runBuild({ disableCssMinify: false });

      const { css } = readCssAsset();
      expect(
        readdirSync(assetsDir()).some((file) => file.endsWith(".css.map")),
      ).toBe(false);
      expect(css).not.toContain("sourceMappingURL");
    });

    it("says why", async () => {
      writeMinificationProofStylesheet();
      await runBuild({ disableCssMinify: false });

      expect(pluginWarnings()).toEqual([
        expect.stringContaining("CSS minification is enabled"),
      ]);
    });

    it("stays quiet when the build has no stylesheets at all", async () => {
      write("src/main.ts", "document.body.className = `banner`;");

      await runBuild({ disableCssMinify: false });

      expect(pluginWarnings()).toEqual([]);
    });
  });

  describe("when a stylesheet cannot be found in its asset", () => {
    /** Renames a rule after capture, so one stylesheet no longer matches. */
    const rewriteWidgetCss = (): Plugin => ({
      name: "rewrite-widget-css",
      enforce: "post",
      generateBundle(_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type === "asset" && asset.fileName.endsWith(".css")) {
            asset.source = String(asset.source).replace(
              ".widget {",
              ".widget-renamed {",
            );
          }
        }
      },
    });

    it("names the stylesheets it could not attribute", async () => {
      await runBuild(undefined, { plugins: [rewriteWidgetCss()] });

      expect(pluginWarnings()).toEqual([
        expect.stringContaining("src/widget.css"),
      ]);
    });

    it("still maps the stylesheets it did find", async () => {
      await runBuild(undefined, { plugins: [rewriteWidgetCss()] });

      const { fileName } = readCssAsset();
      expect(readMap(fileName).sources).toContain("src/banner.css");
    });

    it("stays quiet when every stylesheet is accounted for", async () => {
      await runBuild();

      expect(pluginWarnings()).toEqual([]);
    });

    // These stay listed among the importing chunk's modules but their contents
    // reach the browser as a JavaScript string or as an asset of their own, so
    // the chunk's asset is never where they were supposed to be.
    it("stays quiet about stylesheets imported for their text or URL", async () => {
      write("src/inlined.css", ".inlined {\n  color: teal;\n}\n");
      write("src/read.css", ".read {\n  color: olive;\n}\n");
      write("src/linked.css", ".linked {\n  color: maroon;\n}\n");
      write(
        "src/main.ts",
        [
          'import "./banner.css";',
          'import inlined from "./inlined.css?inline";',
          'import read from "./read.css?raw";',
          'import linked from "./linked.css?url";',
          "document.body.className = `banner`;",
          "console.log(inlined, read, linked);",
        ].join("\n"),
      );

      await runBuild();

      expect(pluginWarnings()).toEqual([]);
    });

    it("still maps a stylesheet imported for its URL, in its own asset", async () => {
      write("src/linked.css", ".linked {\n  color: maroon;\n}\n");
      write(
        "src/main.ts",
        [
          'import "./banner.css";',
          'import linked from "./linked.css?url";',
          "document.body.className = `banner`;",
          "console.log(linked);",
        ].join("\n"),
      );

      await runBuild();

      const linkedAsset = readdirSync(assetsDir()).find(
        (file) => file.startsWith("linked") && file.endsWith(".css.map"),
      );
      expect(
        JSON.parse(readFileSync(join(assetsDir(), linkedAsset ?? ""), "utf8")),
      ).toMatchObject({ sources: ["src/linked.css"] });
    });
  });

  describe("when @tailwindcss/vite inlines imported stylesheets", () => {
    it("emits the import graph Vite's combined map would drop", async () => {
      write("src/hero.css", ".hero {\n  color: red;\n}\n");
      write(
        "src/styles.css",
        '@import "tailwindcss";\n.page {\n  color: blue;\n}\n',
      );
      write("src/main.ts", 'import "./styles.css";\n');

      const hero = join(dir, "src/hero.css");
      const strippedHero = hero.startsWith("/") ? hero.slice(1) : hero;
      const fakeTailwind: Plugin = {
        name: "@tailwindcss/vite:generate:build",
        enforce: "pre",
        transform(code, id) {
          const file = id.split("?")[0] ?? id;
          if (!file.endsWith("styles.css")) {
            return null;
          }
          const combined = `${readFileSync(hero, "utf8")}.page {\n  color: blue;\n}\n`;
          return {
            code: combined,
            map: {
              version: 3,
              sources: [strippedHero, file],
              mappings: encode([
                [[0, 0, 0, 0]],
                [[0, 0, 1, 0]],
                [[0, 0, 2, 0]],
                [[0, 1, 1, 0]],
                [[0, 1, 2, 0]],
              ]),
            },
          };
        },
      };

      await runBuild(undefined, { plugins: [fakeTailwind] });

      const { css, fileName } = readCssAsset();
      const map = readMap(fileName);
      expect(map.sources).toEqual(
        expect.arrayContaining(["src/hero.css", "src/styles.css"]),
      );

      const tracer = new TraceMap(map);
      const heroLine =
        css.split("\n").findIndex((line) => line.includes(".hero")) + 1;
      const pageLine =
        css.split("\n").findIndex((line) => line.includes(".page")) + 1;
      expect(
        originalPositionFor(tracer, { line: heroLine, column: 0 }).source,
      ).toBe("src/hero.css");
      expect(
        originalPositionFor(tracer, { line: pageLine, column: 0 }).source,
      ).toBe("src/styles.css");
    });
  });
});
