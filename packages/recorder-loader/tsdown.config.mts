import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: "cjs",
    target: "es2022",
    fixedExtension: false,
    dts: { sourcemap: true },
    clean: true,
    sourcemap: true,
    treeshake: true,
  },
  {
    entry: { module: "src/index.ts" },
    format: "esm",
    platform: "browser",
    target: "es2022",
    outExtensions: () => ({ js: ".js" }),
    dts: false,
    clean: false,
    sourcemap: true,
    treeshake: true,
  },
]);
