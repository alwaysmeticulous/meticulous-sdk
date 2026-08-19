import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const packageJson = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "package.json"),
    "utf8",
  ),
) as { version: string };

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: "esm",
    // The shim runs inside workerd, not Node. The only non-web import is
    // node:async_hooks, which workerd provides under the nodejs_als compat flag.
    platform: "neutral",
    fixedExtension: false,
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    unbundle: true,
    define: {
      TSDOWN_WORKERD_SHIM_VERSION: JSON.stringify(packageJson.version),
    },
  },
  {
    // The Vite plugin runs in the customer's build, not in workerd, so it gets
    // its own Node-targeted bundle. Bundled rather than unbundled so acorn and
    // magic-string are inlined and stay devDependencies — a package installed
    // into a Worker project should not acquire build-tool dependencies.
    entry: ["src/vite/index.ts"],
    outDir: "dist/vite",
    format: "esm",
    platform: "node",
    fixedExtension: false,
    dts: true,
    clean: false,
    sourcemap: true,
    treeshake: true,
    unbundle: false,
    noExternal: ["acorn", "magic-string"],
  },
]);
