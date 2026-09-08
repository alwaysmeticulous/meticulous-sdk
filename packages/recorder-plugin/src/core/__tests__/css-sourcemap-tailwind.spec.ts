import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  interceptTailwindSourcemaps,
  lookupPreprocessorMap,
  normalizePreprocessorSourcemap,
  restoreAbsoluteSource,
} from "../css-sourcemap-tailwind";
import type { RawSourceMap } from "../css-sourcemap-types";

const map = (sources: string[], mappings = "AAAA"): RawSourceMap => ({
  version: 3,
  sources,
  mappings,
});

describe("restoreAbsoluteSource", () => {
  let dir: string;
  let imported: string;

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "css-sourcemap-tailwind-")));
    imported = join(dir, "imported.css");
    writeFileSync(imported, ".hero{color:red}");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("maps Lightning's synthetic input.css back to the entry file", () => {
    expect(restoreAbsoluteSource("input.css", "/repo/src/styles.css")).toBe(
      "/repo/src/styles.css",
    );
  });

  it("leaves an absolute path alone", () => {
    expect(restoreAbsoluteSource(imported, join(dir, "styles.css"))).toBe(
      imported,
    );
  });

  it("restores a leading separator Lightning CSS stripped", () => {
    const stripped = imported.startsWith(sep) ? imported.slice(1) : imported;
    expect(restoreAbsoluteSource(stripped, join(dir, "styles.css"))).toBe(
      imported,
    );
  });

  it("resolves a relative source against the entry file", () => {
    expect(restoreAbsoluteSource("imported.css", join(dir, "styles.css"))).toBe(
      imported,
    );
  });

  it("decodes a file URL", () => {
    expect(
      restoreAbsoluteSource(
        pathToFileURL(imported).href,
        join(dir, "styles.css"),
      ),
    ).toBe(imported);
  });
});

describe("normalizePreprocessorSourcemap", () => {
  it("returns null when Vite collapsed the sources away", () => {
    expect(
      normalizePreprocessorSourcemap(
        { version: 3, sources: [], mappings: "AAAA" },
        "/src/a.css",
      ),
    ).toBeNull();
  });

  it("accepts a JSON string, the form Tailwind's optimize() returns", () => {
    const normalized = normalizePreprocessorSourcemap(
      JSON.stringify(map(["/repo/src/theme.css"])),
      "/repo/src/styles.css",
    );
    expect(normalized?.sources).toEqual(["/repo/src/theme.css"]);
  });
});

describe("interceptTailwindSourcemaps", () => {
  it("keeps the transform map Vite's combiner would drop", async () => {
    const plugin: Plugin = {
      name: "@tailwindcss/vite:generate:build",
      transform: {
        handler(_code: string, id: string) {
          return {
            code: ".hero{color:red}",
            map: map(["/repo/src/hero.css", id.split("?")[0] ?? id]),
          };
        },
      },
    };
    const stash = new Map<string, RawSourceMap>();
    interceptTailwindSourcemaps([plugin], stash);

    const transform = plugin.transform;
    if (typeof transform !== "object" || transform.handler == null) {
      throw new Error("expected an object transform hook");
    }
    await transform.handler.call(
      {},
      "@import 'tailwindcss';",
      "/repo/src/styles.css?transform-only",
    );

    expect(
      lookupPreprocessorMap(stash, "/repo/src/styles.css?transform-only")
        ?.sources,
    ).toEqual(["/repo/src/hero.css", "/repo/src/styles.css"]);
    expect(
      lookupPreprocessorMap(stash, "/repo/src/styles.css")?.sources,
    ).toEqual(["/repo/src/hero.css", "/repo/src/styles.css"]);
  });

  it("keeps the richer map when Vite also transforms the ?url id", async () => {
    const plugin: Plugin = {
      name: "@tailwindcss/vite:generate:build",
      transform(_code: string, id: string) {
        if (id.includes("?url")) {
          return { code: "export default '/styles.css'", map: map([id]) };
        }
        return {
          code: ".hero{color:red}",
          map: map(["/repo/src/hero.css", "/repo/src/styles.css"]),
        };
      },
    };
    const stash = new Map<string, RawSourceMap>();
    interceptTailwindSourcemaps([plugin], stash);

    const transform = plugin.transform;
    if (typeof transform !== "function") {
      throw new Error("expected a function transform hook");
    }
    await transform.call({}, "", "/repo/src/styles.css?url");
    await transform.call({}, "", "/repo/src/styles.css?transform-only");

    expect(
      lookupPreprocessorMap(stash, "/repo/src/styles.css")?.sources,
    ).toEqual(["/repo/src/hero.css", "/repo/src/styles.css"]);
  });
});
