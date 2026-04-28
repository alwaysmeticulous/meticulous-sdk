import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/vite.ts",
    "src/webpack.ts",
    "src/rspack.ts",
    "src/nuxt.ts",
  ],
  format: "esm",
  platform: "node",
  fixedExtension: false,
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  unbundle: true,
});
