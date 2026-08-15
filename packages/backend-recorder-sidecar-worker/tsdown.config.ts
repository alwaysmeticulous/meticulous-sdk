import { defineConfig } from "tsdown";
import { resolveCommitHash } from "./scripts/resolve-commit-hash.mjs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  // Runs inside workerd, not Node. Everything here is WebCrypto, fetch and the Durable Objects
  // API; the only non-web import comes via the shim's `node:async_hooks`, which workerd provides
  // under the nodejs_als compat flag.
  platform: "neutral",
  fixedExtension: false,
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  unbundle: true,
  define: {
    TSDOWN_METICULOUS_COMMIT_HASH: JSON.stringify(
      resolveCommitHash("backend-recorder-sidecar-worker"),
    ),
  },
});
