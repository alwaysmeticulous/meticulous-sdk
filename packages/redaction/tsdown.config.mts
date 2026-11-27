import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: "cjs",
    target: "es2022",
    fixedExtension: false,
    deps: {
      neverBundle: [
        "@alwaysmeticulous/api",
        "@alwaysmeticulous/sdk-bundles-api",
      ],
    },
    dts: { sourcemap: true },
    clean: true,
    sourcemap: true,
    treeshake: true,
  },
  {
    entry: { module: "src/index.ts" },
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outExtensions: () => ({ js: ".js" }),
    deps: {
      neverBundle: [
        "@alwaysmeticulous/api",
        "@alwaysmeticulous/sdk-bundles-api",
      ],
    },
    dts: false,
    clean: false,
    sourcemap: true,
    treeshake: true,
  },
]);
