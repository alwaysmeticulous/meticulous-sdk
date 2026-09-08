import { existsSync, readdirSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, extname, join } from "path";
import { describe, expect, it } from "vitest";

/**
 * The CLI is compiled to CommonJS, so every top-level `import` of a runtime
 * dependency becomes a `require()`. Requiring an ESM-only package throws
 * `ERR_REQUIRE_ESM` on any Node without unflagged `require(esm)` support —
 * which includes Node 18, the floor this package's `engines` still declares.
 * A top-level import is evaluated while the command modules load, so it would
 * take down the whole CLI rather than just the feature using it.
 *
 * Depend on versions that publish a CommonJS entry point. If a dependency is
 * genuinely ESM-only (e.g. puppeteer-core >=25, forced across the workspace
 * by a `pnpm.overrides` security bump — see KNOWN_ESM_ONLY_DEPENDENCIES),
 * only ever reach it through a runtime `import()` at the point of use — never
 * a top-level `import` — so a Node too old to load it fails just that one
 * command, and add it to the allowlist below.
 */
describe("runtime dependencies", () => {
  it("all resolve to CommonJS, aside from the known ESM-only exceptions", () => {
    const esmOnly = runtimeDependencies()
      .filter((dependency) => !KNOWN_ESM_ONLY_DEPENDENCIES.has(dependency))
      .filter(resolvesToEsModule);

    expect(esmOnly).toEqual([]);
  });

  it("never statically imports a known ESM-only dependency", () => {
    const staticImports = Array.from(KNOWN_ESM_ONLY_DEPENDENCIES).filter(
      (dependency) => isStaticallyImportedAsValue(dependency),
    );

    expect(staticImports).toEqual([]);
  });
});

/**
 * Direct dependencies with no working CommonJS entry point. Each one must
 * only be reached via a runtime `import()`, never a top-level `import`, so
 * `require`-ing it can't crash the whole CLI on an old Node — see the
 * `describe` block comment above.
 */
const KNOWN_ESM_ONLY_DEPENDENCIES = new Set(["puppeteer-core"]);

const CLI_PACKAGE_ROOT = join(__dirname, "..", "..");

// `createRequire` only needs a path to resolve relative to; the file itself
// need not exist.
const requireFromCli = createRequire(join(CLI_PACKAGE_ROOT, "index.js"));

const runtimeDependencies = (): string[] => {
  const packageJson = readPackageJson(join(CLI_PACKAGE_ROOT, "package.json"));
  return Object.keys(packageJson?.["dependencies"] ?? {});
};

const resolvesToEsModule = (dependency: string): boolean => {
  let entryPoint: string;
  try {
    entryPoint = requireFromCli.resolve(dependency);
  } catch {
    // No `require` resolution at all, e.g. an `exports` map offering only an
    // `import` condition.
    return true;
  }
  return isEsModule(entryPoint);
};

/** Mirrors how Node decides whether a file is ESM or CommonJS. */
const isEsModule = (filePath: string): boolean => {
  const extension = extname(filePath);
  if (extension === ".mjs") {
    return true;
  }
  if (extension !== ".js") {
    return false;
  }
  return nearestPackageType(dirname(filePath)) === "module";
};

const nearestPackageType = (startDir: string): string => {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const type = readPackageJson(candidate)?.["type"];
      return typeof type === "string" ? type : "commonjs";
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return "commonjs";
    }
    dir = parent;
  }
};

const readPackageJson = (path: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

// Vendored doc content copied verbatim into `dist`, not compiled CLI source
// (see the `exclude` in tsconfig.json) — not subject to this check.
const VENDORED_TEMPLATES_DIR = join(
  "src",
  "commands",
  "onboard",
  "templates",
  "vendored",
);

const isStaticallyImportedAsValue = (dependency: string): boolean =>
  sourceFiles().some((file) =>
    hasStaticValueImport(readFileSync(file, "utf8"), dependency),
  );

const sourceFiles = (): string[] => {
  const srcDir = join(CLI_PACKAGE_ROOT, "src");
  return readdirSync(srcDir, { recursive: true })
    .map((relativePath) => relativePath.toString())
    .filter((relativePath) => extname(relativePath) === ".ts")
    .filter(
      (relativePath) =>
        !join("src", relativePath).startsWith(VENDORED_TEMPLATES_DIR),
    )
    .map((relativePath) => join(srcDir, relativePath));
};

/**
 * A conservative, per-line check: any `import ... from "<dependency>"` line
 * that isn't exactly a top-level `import type` counts as a value import,
 * even if every named specifier is individually marked `type` — write the
 * whole statement as `import type` instead of mixing, so this stays simple.
 * Assumes each import statement fits on one line, true of this codebase's
 * formatting for the dependencies this check applies to.
 */
const hasStaticValueImport = (source: string, dependency: string): boolean => {
  const importFromDependency = new RegExp(
    `^import\\s.*from\\s+["']${dependency}["'];?\\s*$`,
    "gm",
  );
  const isTypeOnly = (line: string): boolean => /^import\s+type\s/.test(line);

  const matches = source.match(importFromDependency) ?? [];
  return matches.some((line) => !isTypeOnly(line));
};
