import { cpSync, existsSync, writeFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { BUNDLED_ASSETS } from "./bundle-assets.mjs";

const require = createRequire(import.meta.url);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(packageRoot, "dist");

const result = await build({
  absWorkingDir: packageRoot,
  bundle: true,
  entryPoints: [
    { in: "src/index.ts", out: "index" },
    {
      // The tunnel client forks cluster workers from this file, resolved next
      // to its own module; in the bundle that is dist/.
      in: require.resolve("@alwaysmeticulous/tunnels-client/dist/lib/tunnel-worker.entrypoint.js"),
      out: "tunnel-worker.entrypoint",
    },
  ],
  // Read by src/bundled-assets.ts to locate the assets copied below.
  define: { "process.env.METICULOUS_CLI_BUNDLED": '"true"' },
  format: "cjs",
  keepNames: true,
  legalComments: "external",
  metafile: true,
  outdir: "dist",
  platform: "node",
  plugins: [
    {
      // Both packages expose ESM entrypoints to `import`, but their CommonJS
      // entrypoints bundle more reliably for a CommonJS executable.
      name: "commonjs-entrypoints",
      setup(build) {
        build.onResolve({ filter: /^yargs$/ }, () => ({
          path: require.resolve("yargs"),
        }));
        build.onResolve({ filter: /^prettier$/ }, () => ({
          path: join(packageRoot, "scripts", "prettier-shim.ts"),
        }));
        build.onResolve(
          { filter: /^puppeteer-core\/lib\/puppeteer\/revisions\.js$/ },
          () => ({
            // browser-installer picks the Chrome version from this file, but
            // puppeteer-core 24.x (which we publish for Node 18 support) only
            // has it at build-specific paths it reaches via a runtime import.
            // A bundle has no puppeteer-core on disk, so resolve it here.
            path: resolvePuppeteerRevisions(),
          }),
        );
        build.onResolve(
          { filter: /^puppeteer-core(?:\/.*)?$/ },
          ({ path }) => ({
            // Force imports from workspace packages to the CLI's own copy so
            // the bundle contains exactly one puppeteer-core.
            path: require.resolve(path),
          }),
        );
        build.onResolve(
          { filter: /^(?:bufferutil|cpu-features|utf-8-validate)$/ },
          ({ path }) => ({
            // ws and ssh2 treat these native acceleration modules as optional
            // and fall back to JavaScript/Node implementations.
            external: true,
            path,
          }),
        );
      },
    },
  ],
  sourcemap: true,
  sourcesContent: false,
  target: "node18",
});

function resolvePuppeteerRevisions() {
  const puppeteerRoot = dirname(require.resolve("puppeteer-core/package.json"));
  const candidates = [
    "lib/puppeteer/revisions.js",
    "lib/cjs/puppeteer/revisions.js",
  ].map((relativePath) => join(puppeteerRoot, relativePath));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found == null) {
    throw new Error(
      `puppeteer-core revisions not found; tried:\n${candidates.join("\n")}`,
    );
  }
  return found;
}

const optionalRuntimeImports = new Set([
  // Optional performance/platform enhancements. Their callers all fall back
  // when these modules are absent.
  "cpu-features",
  "bufferutil",
  "macos-temperature-sensor",
  "osx-temperature-sensor",
  "utf-8-validate",
  "./crypto/build/Release/sshcrypto.node",
]);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
]);
const unresolvedImports = Object.values(result.metafile.outputs)
  .flatMap((output) => output.imports)
  .filter(
    ({ external, path }) =>
      external && !nodeBuiltins.has(path) && !optionalRuntimeImports.has(path),
  );

if (unresolvedImports.length > 0) {
  throw new Error(
    `CLI bundle has unresolved runtime imports:\n${unresolvedImports
      .map(({ path, kind }) => `  ${path} (${kind})`)
      .join("\n")}`,
  );
}

// bin/meticulous, CI configs and scripts run dist/main.js directly, so it stays
// the CLI entrypoint; the code itself lives once, in the index bundle.
writeFileSync(
  join(distDir, "main.js"),
  '"use strict";\nrequire("./index.js").main();\n',
);

for (const { name, source } of BUNDLED_ASSETS) {
  cpSync(join(packageRoot, source), join(distDir, name), { recursive: true });
}
