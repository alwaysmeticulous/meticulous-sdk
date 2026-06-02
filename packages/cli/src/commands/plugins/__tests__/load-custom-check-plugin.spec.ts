import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadCustomCheckPlugin as loadCustomCheckPluginRaw,
  type ModuleImporter,
} from "../load-custom-check-plugin";

// Production loads plugins via a `new Function("return import(...)")` importer
// so the native dynamic import survives the CommonJS compile (verified
// separately against the built output). That importer can't run inside
// vitest's VM, so here we inject a plain dynamic import, which vitest supports.
const importModule: ModuleImporter = (specifier) => import(specifier);
const loadCustomCheckPlugin = (pluginPath: string) =>
  loadCustomCheckPluginRaw(pluginPath, importModule);

const VALID_MANIFEST = {
  id: "network-requests-check",
  type: "custom-check",
  version: "1.0.0",
  configuration: {
    displayName: "Network Requests",
    handlesSnapshotTypes: ["network-requests"],
    entryPoint: "./entrypoint.cjs",
  },
};

describe("loadCustomCheckPlugin", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  const makePluginDir = async (
    files: Record<string, string>,
  ): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), "meticulous-plugin-test-"));
    tempDirs.push(dir);
    await Promise.all(
      Object.entries(files).map(([name, contents]) =>
        writeFile(join(dir, name), contents, "utf-8"),
      ),
    );
    return dir;
  };

  const CJS_ENTRYPOINT = `module.exports = {
    execute: async () => ({
      verdict: "pass",
      summary: "ok",
      report: { type: "markdown", markdown: "no new requests" },
    }),
  };`;

  it("loads a CommonJS plugin and exposes its manifest and check", async () => {
    const dir = await makePluginDir({
      "manifest.json": JSON.stringify(VALID_MANIFEST),
      "entrypoint.cjs": CJS_ENTRYPOINT,
    });

    const { manifest, check } = await loadCustomCheckPlugin(dir);

    expect(manifest.id).toBe("network-requests-check");
    expect(manifest.configuration.handlesSnapshotTypes).toEqual([
      "network-requests",
    ]);
    const output = await check.execute({
      baseSnapshots: [],
      headSnapshots: [],
    });
    expect(output.verdict).toBe("pass");
  });

  it("loads an ESM plugin that uses a default export", async () => {
    const dir = await makePluginDir({
      "manifest.json": JSON.stringify({
        ...VALID_MANIFEST,
        configuration: {
          ...VALID_MANIFEST.configuration,
          entryPoint: "./entrypoint.mjs",
        },
      }),
      "entrypoint.mjs": `export default {
        execute: async () => ({
          verdict: "warn",
          report: { type: "markdown", markdown: "1 new request" },
        }),
      };`,
    });

    const { check } = await loadCustomCheckPlugin(dir);
    const output = await check.execute({
      baseSnapshots: [],
      headSnapshots: [],
    });
    expect(output.verdict).toBe("warn");
  });

  it("throws when the manifest is missing", async () => {
    const dir = await makePluginDir({ "entrypoint.cjs": CJS_ENTRYPOINT });
    await expect(loadCustomCheckPlugin(dir)).rejects.toThrow(
      /Could not read plugin manifest/,
    );
  });

  it("throws when the manifest is not valid JSON", async () => {
    const dir = await makePluginDir({ "manifest.json": "{ not json" });
    await expect(loadCustomCheckPlugin(dir)).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the manifest type is not custom-check", async () => {
    const dir = await makePluginDir({
      "manifest.json": JSON.stringify({ ...VALID_MANIFEST, type: "other" }),
      "entrypoint.cjs": CJS_ENTRYPOINT,
    });
    await expect(loadCustomCheckPlugin(dir)).rejects.toThrow(/"custom-check"/);
  });

  it("throws when handlesSnapshotTypes is empty", async () => {
    const dir = await makePluginDir({
      "manifest.json": JSON.stringify({
        ...VALID_MANIFEST,
        configuration: {
          ...VALID_MANIFEST.configuration,
          handlesSnapshotTypes: [],
        },
      }),
      "entrypoint.cjs": CJS_ENTRYPOINT,
    });
    await expect(loadCustomCheckPlugin(dir)).rejects.toThrow(
      /handlesSnapshotTypes/,
    );
  });

  it("throws when the entry point file is missing", async () => {
    const dir = await makePluginDir({
      "manifest.json": JSON.stringify(VALID_MANIFEST),
    });
    await expect(loadCustomCheckPlugin(dir)).rejects.toThrow(
      /Failed to load plugin entry point/,
    );
  });

  it("throws when the entry point does not export an execute function", async () => {
    const dir = await makePluginDir({
      "manifest.json": JSON.stringify(VALID_MANIFEST),
      "entrypoint.cjs": `module.exports = { notExecute: 1 };`,
    });
    await expect(loadCustomCheckPlugin(dir)).rejects.toThrow(
      /must default-export a custom check with an `execute` function/,
    );
  });
});
