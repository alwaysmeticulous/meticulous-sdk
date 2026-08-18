import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, extname, join } from "path";
import { describe, expect, it } from "vitest";

/**
 * The CLI is compiled to CommonJS, so every `import` of a runtime dependency
 * becomes a `require()`. Requiring an ESM-only package throws
 * `ERR_REQUIRE_ESM` on any Node without unflagged `require(esm)` support —
 * which includes Node 18, the floor this package's `engines` still declares.
 * The failure happens while the command modules load, so a single ESM-only
 * dependency takes down the whole CLI rather than just the feature using it.
 *
 * Depend on versions that publish a CommonJS entry point. If a dependency is
 * genuinely ESM-only, load it with a runtime `import()` that survives the
 * TypeScript downlevel rather than a top-level import.
 */
describe("runtime dependencies", () => {
  it("all resolve to CommonJS", () => {
    const esmOnly = runtimeDependencies().filter(resolvesToEsModule);

    expect(esmOnly).toEqual([]);
  });
});

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
