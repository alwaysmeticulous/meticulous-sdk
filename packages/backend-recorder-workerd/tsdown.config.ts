import { defineConfig } from "tsdown";

export default defineConfig({
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
});
