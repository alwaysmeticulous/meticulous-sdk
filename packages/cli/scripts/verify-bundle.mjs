import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_ASSETS } from "./bundle-assets.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(packageRoot, "dist");
const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
  throw new Error("Bundled CLI must not declare runtime dependencies");
}

// Consumers get no dependencies installed, so every declaration reachable from
// the package's types entry must resolve within the package itself.
const pendingDeclarations = [join(distDir, "index.d.ts")];
const visitedDeclarations = new Set();
while (pendingDeclarations.length > 0) {
  const declarationPath = pendingDeclarations.pop();
  if (visitedDeclarations.has(declarationPath)) {
    continue;
  }
  visitedDeclarations.add(declarationPath);
  const source = readFileSync(declarationPath, "utf8");
  for (const [, specifier] of source.matchAll(
    /\b(?:from\s+|import\()["']([^"']+)["']/gu,
  )) {
    if (!specifier.startsWith(".")) {
      throw new Error(
        `Bundled CLI public types import "${specifier}" from ${declarationPath}`,
      );
    }
    pendingDeclarations.push(
      join(dirname(declarationPath), `${specifier.replace(/\.js$/u, "")}.d.ts`),
    );
  }
}

for (const asset of [
  "main.js",
  "tunnel-worker.entrypoint.js",
  "commands/onboard/templates/CLAUDE.md",
  ...BUNDLED_ASSETS.map(({ name, marker }) => join(name, marker)),
]) {
  if (!existsSync(join(distDir, asset))) {
    throw new Error(`Bundled CLI runtime asset is missing: dist/${asset}`);
  }
}

const result = spawnSync(
  process.execPath,
  [join(packageRoot, "bin", "meticulous"), "--help"],
  {
    encoding: "utf8",
    env: { ...process.env, METICULOUS_DISABLE_SENTRY: "true" },
  },
);

if (result.status !== 0 || !result.stdout.startsWith("meticulous <command>")) {
  throw new Error(
    `Bundled CLI smoke test failed:\n${result.stderr || result.stdout}`,
  );
}
