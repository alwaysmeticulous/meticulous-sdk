import { readFile } from "fs/promises";
import { resolve } from "path";
import { pathToFileURL } from "url";
import type {
  CustomCheck,
  CustomCheckPluginManifest,
} from "@alwaysmeticulous/api";

const MANIFEST_FILE_NAME = "manifest.json";

/** Imports a module by absolute file URL, returning its namespace object. */
export type ModuleImporter = (
  specifier: string,
) => Promise<Record<string, unknown>>;

// This package is compiled to CommonJS, where `tsc` would downlevel a direct
// `import()` into `require()` — which cannot load ESM plugins and cannot accept
// a file:// URL. Building the dynamic import via `new Function` preserves a
// native runtime `import()`, which loads both CommonJS and ESM plugin entry
// points from an absolute file URL.
const nativeImportModule = new Function(
  "specifier",
  "return import(specifier);",
) as ModuleImporter;

export interface LoadedCustomCheckPlugin {
  manifest: CustomCheckPluginManifest;
  check: CustomCheck;
}

/**
 * Loads a custom check plugin from a built plugin directory containing a
 * `manifest.json` and the entry point it points to. The manifest is parsed and
 * validated first (without executing any plugin code), then the entry point is
 * dynamically imported and checked to expose an `execute` function.
 */
export const loadCustomCheckPlugin = async (
  pluginPath: string,
  // Injectable so unit tests can pass an importer that works inside the test
  // runner's VM (where the `new Function` import is unavailable). Production
  // uses the native dynamic import above.
  importModule: ModuleImporter = nativeImportModule,
): Promise<LoadedCustomCheckPlugin> => {
  const pluginDir = resolve(pluginPath);
  const manifest = await readManifest(pluginDir);
  const check = await loadEntryPoint(pluginDir, manifest, importModule);
  return { manifest, check };
};

const readManifest = async (
  pluginDir: string,
): Promise<CustomCheckPluginManifest> => {
  const manifestPath = resolve(pluginDir, MANIFEST_FILE_NAME);

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch {
    throw new Error(
      `Could not read plugin manifest at ${manifestPath}. Pass --pluginPath pointing at a built plugin directory containing a ${MANIFEST_FILE_NAME}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Plugin manifest at ${manifestPath} is not valid JSON.`);
  }

  return validateManifest(parsed, manifestPath);
};

const validateManifest = (
  parsed: unknown,
  manifestPath: string,
): CustomCheckPluginManifest => {
  const fail = (reason: string): never => {
    throw new Error(`Invalid plugin manifest at ${manifestPath}: ${reason}`);
  };

  if (typeof parsed !== "object" || parsed === null) {
    return fail("expected a JSON object.");
  }
  const manifest = parsed as Record<string, unknown>;

  if (manifest["type"] !== "custom-check") {
    return fail(`expected "type" to be "custom-check".`);
  }
  if (typeof manifest["id"] !== "string" || manifest["id"].length === 0) {
    return fail(`expected a non-empty string "id".`);
  }
  if (typeof manifest["version"] !== "string") {
    return fail(`expected a string "version".`);
  }

  const configuration = manifest["configuration"];
  if (typeof configuration !== "object" || configuration === null) {
    return fail(`expected a "configuration" object.`);
  }
  const config = configuration as Record<string, unknown>;

  if (typeof config["displayName"] !== "string") {
    return fail(`expected "configuration.displayName" to be a string.`);
  }
  if (typeof config["entryPoint"] !== "string") {
    return fail(`expected "configuration.entryPoint" to be a string.`);
  }
  if (
    !Array.isArray(config["handlesSnapshotTypes"]) ||
    config["handlesSnapshotTypes"].length === 0 ||
    !config["handlesSnapshotTypes"].every(
      (type): type is string => typeof type === "string",
    )
  ) {
    return fail(
      `expected "configuration.handlesSnapshotTypes" to be a non-empty array of strings.`,
    );
  }

  return manifest as unknown as CustomCheckPluginManifest;
};

const loadEntryPoint = async (
  pluginDir: string,
  manifest: CustomCheckPluginManifest,
  importModule: ModuleImporter,
): Promise<CustomCheck> => {
  const entryPointPath = resolve(pluginDir, manifest.configuration.entryPoint);

  let imported: Record<string, unknown>;
  try {
    imported = await importModule(pathToFileURL(entryPointPath).href);
  } catch (error) {
    throw new Error(
      `Failed to load plugin entry point ${entryPointPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  // Support both `export default check` (ESM) and `module.exports = check` (CJS).
  const candidate = (imported["default"] ?? imported) as Partial<CustomCheck>;
  if (typeof candidate?.execute !== "function") {
    throw new Error(
      `Plugin entry point ${entryPointPath} must default-export a custom check with an \`execute\` function.`,
    );
  }
  return candidate as CustomCheck;
};
