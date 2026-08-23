import { parse } from "acorn";
import MagicString from "magic-string";
import { describe, expect, it } from "vitest";
import { meticulousCoverage, type TransformContextLike } from "../vite/index";

const transform = (
  plugin: ReturnType<typeof meticulousCoverage>,
  code: string,
  id: string,
  ssr = true,
) => plugin.transform?.(code, id, { ssr });

const APP = `
export function handler(flag) {
  if (flag) {
    return 1;
  }
  return 0;
}
`;

describe("meticulousCoverage plugin", () => {
  it("instruments SSR modules and appends a self-registration", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    const result = transform(plugin, APP, "/repo/src/handler.ts");

    expect(result).not.toBeNull();
    expect(() =>
      parse(result!.code, { ecmaVersion: "latest", sourceType: "module" }),
    ).not.toThrow();
    expect(result!.code).toContain("registerCoverageFile as __mcR$");
    expect(result!.code).toContain("firstId:0");
    expect(result!.code).toMatch(/lineRanges:\[[0-9,]+\]/);
  });

  it("gives each module a disjoint slice of the id space", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    const first = transform(plugin, APP, "/repo/src/a.ts");
    const second = transform(plugin, APP, "/repo/src/b.ts");

    const firstIdOf = (code: string): number =>
      Number(/firstId:(\d+)/.exec(code)![1]);
    const rangeCountOf = (code: string): number =>
      /lineRanges:\[([0-9,]*)\]/.exec(code)![1].split(",").length / 2;

    expect(firstIdOf(first!.code)).toBe(0);
    expect(firstIdOf(second!.code)).toBe(rangeCountOf(first!.code));
  });

  it("records paths relative to the project root, posix-separated", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    plugin.configResolved?.({ root: "/repo" });
    const result = transform(plugin, APP, "/repo/src/nested/handler.ts");
    expect(result!.code).toContain('path:"src/nested/handler.ts"');
  });

  it("keeps a workspace package outside the root resolvable, not machine-specific", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    plugin.configResolved?.({ root: "/home/runner/work/repo/repo/apps/web" });
    const result = transform(
      plugin,
      APP,
      "/home/runner/work/repo/repo/packages/ui/button.tsx",
    );
    // The `../` count is the root's depth, so stripping them (which the
    // post-process does) leaves the repo-relative path. Emitting the absolute
    // path instead would bake in the build machine's checkout prefix, which
    // resolves against no repo file and is discarded as unmapped.
    expect(result!.code).toContain('path:"../../packages/ui/button.tsx"');
    expect(result!.code).not.toContain("/home/runner");
  });

  it("skips client modules unless asked", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    expect(transform(plugin, APP, "/repo/src/a.ts", false)).toBeNull();

    const withClient = meticulousCoverage({
      includeClient: true,
      onWarning: () => {},
    });
    expect(transform(withClient, APP, "/repo/src/a.ts", false)).not.toBeNull();
  });

  it("skips node_modules, virtual modules and non-JS files", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    expect(
      transform(plugin, APP, "/repo/node_modules/dep/index.js"),
    ).toBeNull();
    expect(transform(plugin, APP, "\0virtual:thing")).toBeNull();
    expect(transform(plugin, APP, "virtual:my-module")).toBeNull();
    expect(transform(plugin, APP, "node:fs")).toBeNull();
    expect(transform(plugin, APP, "cloudflare:workers")).toBeNull();
    expect(transform(plugin, APP, "/repo/src/styles.css")).toBeNull();
  });

  it("instruments a Windows path rather than reading the drive as a protocol", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    expect(transform(plugin, APP, "C:/repo/src/handler.ts")).not.toBeNull();
  });

  it("honours extra exclude patterns", () => {
    const plugin = meticulousCoverage({
      exclude: [/generated/],
      onWarning: () => {},
    });
    expect(transform(plugin, APP, "/repo/src/generated/api.ts")).toBeNull();
    expect(transform(plugin, APP, "/repo/src/real.ts")).not.toBeNull();
  });

  it("warns when a build instruments nothing, rather than reporting 0% silently", () => {
    const warnings: string[] = [];
    const plugin = meticulousCoverage({ onWarning: (m) => warnings.push(m) });
    plugin.buildEnd?.();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("instrumented no modules");
  });

  it("reports what it instrumented on a successful build", () => {
    const warnings: string[] = [];
    const plugin = meticulousCoverage({ onWarning: (m) => warnings.push(m) });
    transform(plugin, APP, "/repo/src/a.ts");
    plugin.buildEnd?.();
    expect(warnings[0]).toMatch(/instrumented 1 module\(s\), \d+ line marker/);
  });

  it("passes through a module it cannot parse", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    expect(
      transform(plugin, "const x: number = 1;", "/repo/src/a.ts"),
    ).toBeNull();
  });
});

/**
 * The plugin runs after the build's own TypeScript/JSX pass, which re-prints the
 * module and drops comments and blank lines. Without resolving through the
 * transform chain's map, every recorded line would be short by however much was
 * stripped above it — so these assert against the pre-strip source.
 */
describe("meticulousCoverage line fidelity", () => {
  const SOURCE = [
    "/**",
    " * A doc comment, of the kind every real module carries.",
    " * Several lines of it.",
    " */",
    "",
    "export const handle = (flag) => {",
    "  if (flag) {",
    "    return 1;",
    "  }",
    "  return 0;",
    "};",
  ].join("\n");

  /** Strips the leading comment block the way the build's printer would. */
  const stripHeader = (
    source: string,
    sourcePath: string,
  ): { code: string; map: TransformContextLike } => {
    const magic = new MagicString(source);
    magic.remove(0, source.indexOf("export const"));
    const map = magic.generateMap({ source: sourcePath, hires: true });
    return {
      code: magic.toString(),
      map: { getCombinedSourcemap: () => map },
    };
  };

  const linesOf = (code: string): number[] =>
    /lineRanges:\[([0-9,]+)\]/.exec(code)![1].split(",").map(Number);

  it("records lines from the original source, not the code it was handed", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    plugin.configResolved?.({ root: "/repo" });
    const { code, map } = stripHeader(SOURCE, "/repo/src/handle.ts");

    const result = plugin.transform?.call(map, code, "/repo/src/handle.ts", {
      ssr: true,
    });

    // `if (flag)` is source line 7, `return 1` line 8, `return 0` line 10 —
    // lines 2, 3 and 5 of the stripped code the plugin actually saw.
    expect(linesOf(result!.code)).toEqual([7, 7, 8, 8, 10, 10]);
  });

  it("skips a module whose source map covers some other file", () => {
    const warnings: string[] = [];
    const plugin = meticulousCoverage({ onWarning: (m) => warnings.push(m) });
    const { code } = stripHeader(SOURCE, "/repo/src/handle.ts");
    const foreignMap: TransformContextLike = {
      getCombinedSourcemap: () => ({
        version: 3,
        sources: ["/repo/src/other.ts", "/repo/src/another.ts"],
        mappings: "AAAA",
      }),
    };

    const result = plugin.transform?.call(
      foreignMap,
      code,
      "/repo/src/handle.ts",
      { ssr: true },
    );

    expect(result).toBeNull();
    plugin.buildEnd?.();
    expect(warnings[0]).toContain("source map does not cover them");
  });

  it("falls back to the code's own lines when no map is available, and says so", () => {
    const warnings: string[] = [];
    const plugin = meticulousCoverage({ onWarning: (m) => warnings.push(m) });
    const { code } = stripHeader(SOURCE, "/repo/src/handle.ts");

    const result = plugin.transform?.(code, "/repo/src/handle.ts", {
      ssr: true,
    });

    expect(linesOf(result!.code)).toEqual([2, 2, 3, 3, 5, 5]);
    plugin.buildEnd?.();
    expect(warnings[0]).toContain("had no source map");
  });

  it("treats a throwing or sectioned map as no map rather than failing the build", () => {
    const plugin = meticulousCoverage({ onWarning: () => {} });
    const { code } = stripHeader(SOURCE, "/repo/src/handle.ts");

    const throwing: TransformContextLike = {
      getCombinedSourcemap: () => {
        throw new Error("no map here");
      },
    };
    const sectioned: TransformContextLike = {
      getCombinedSourcemap: () => ({ version: 3, sections: [] }),
    };

    for (const context of [throwing, sectioned]) {
      const result = plugin.transform?.call(context, code, "/repo/src/a.ts", {
        ssr: true,
      });
      expect(result).not.toBeNull();
    }
  });
});
