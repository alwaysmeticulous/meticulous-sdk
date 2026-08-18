import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, isAbsolute, join, relative, resolve } from "path";
import search from "@inquirer/search";
import chalk from "chalk";
import { CliUserError } from "../../utils/cli-user-error";
import {
  isPathInsideRoot,
  isRealDirectoryInsideProject,
  resolveRealProjectRoot,
} from "./safe-repo-fs";

export interface DiscoveredApp {
  /** Repo-relative path (`.` for single-package at root). */
  path: string;
  name: string;
  packageName: string | null;
}

const FRONTEND_DEPS = [
  "react",
  "react-dom",
  "next",
  "vue",
  "nuxt",
  "nuxt3",
  "@angular/core",
  "svelte",
  "@sveltejs/kit",
  "@remix-run/react",
  "remix",
  "solid-js",
] as const;

const WORKSPACE_DIRS = [
  "apps",
  "packages",
  "projects",
  "services",
  "web",
  "frontend",
  "client",
] as const;

const readJson = (path: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const hasFrontendDependency = (pkg: Record<string, unknown>): boolean => {
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") {
      continue;
    }
    for (const name of FRONTEND_DEPS) {
      if (name in deps) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Markers that indicate a runnable application (something a browser loads),
 * as opposed to a shared library package.
 */
const hasAppMarkers = (
  absDir: string,
  pkg: Record<string, unknown>,
): boolean => {
  if (
    existsSync(join(absDir, "index.html")) ||
    existsSync(join(absDir, "public", "index.html")) ||
    existsSync(join(absDir, "pages")) ||
    existsSync(join(absDir, "src", "pages")) ||
    existsSync(join(absDir, "app", "layout.tsx")) ||
    existsSync(join(absDir, "app", "layout.jsx")) ||
    existsSync(join(absDir, "src", "app", "layout.tsx")) ||
    existsSync(join(absDir, "src", "app", "layout.jsx"))
  ) {
    return true;
  }
  for (const config of [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "nuxt.config.ts",
    "nuxt.config.js",
    "astro.config.mjs",
    "remix.config.js",
    "angular.json",
  ]) {
    if (existsSync(join(absDir, config))) {
      return true;
    }
  }
  // A dev-server style script strongly suggests an app, not a library.
  const scripts = pkg["scripts"];
  if (scripts && typeof scripts === "object") {
    const devServerPattern =
      /\b(next dev|vite\b(?!.*\bbuild\b)|webpack serve|webpack-dev-server|react-scripts start|ng serve|nuxt dev|remix dev|astro dev|rsbuild dev|parcel\b(?!.*\bbuild\b))/;
    for (const key of ["start", "dev", "serve"]) {
      const value = (scripts as Record<string, unknown>)[key];
      if (typeof value === "string" && devServerPattern.test(value)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Published/shared library packages declare consumable entry points. Treat a
 * package as a library when it has those and no app markers — e.g. Grafana's
 * `@grafana/ui` under packages/ — so the picker only offers real apps.
 */
const looksLikeLibraryPackage = (pkg: Record<string, unknown>): boolean =>
  Boolean(
    pkg["main"] ||
    pkg["module"] ||
    pkg["exports"] ||
    pkg["types"] ||
    pkg["typings"] ||
    pkg["publishConfig"],
  );

const hasRunnableScript = (pkg: Record<string, unknown>): boolean => {
  const scripts = pkg["scripts"];
  if (!scripts || typeof scripts !== "object") {
    return false;
  }
  return ["start", "dev", "serve", "preview"].some(
    (key) => typeof (scripts as Record<string, unknown>)[key] === "string",
  );
};

const looksLikeFrontendApp = (
  absDir: string,
  pkg: Record<string, unknown>,
  { isRoot }: { isRoot: boolean },
): boolean => {
  if (hasAppMarkers(absDir, pkg)) {
    return true;
  }
  if (looksLikeLibraryPackage(pkg)) {
    return false;
  }
  if (!hasFrontendDependency(pkg)) {
    return false;
  }
  // Nested workspace packages with frontend deps but nothing runnable are
  // shared config/tooling packages, not apps. The repo root gets the benefit
  // of the doubt since dev servers there are often driven by Makefiles etc.
  return isRoot || hasRunnableScript(pkg);
};

const isMonorepoRoot = (projectRoot: string): boolean => {
  if (
    existsSync(join(projectRoot, "pnpm-workspace.yaml")) ||
    existsSync(join(projectRoot, "lerna.json")) ||
    existsSync(join(projectRoot, "nx.json")) ||
    existsSync(join(projectRoot, "turbo.json"))
  ) {
    return true;
  }
  const pkg = readJson(join(projectRoot, "package.json"));
  if (!pkg) {
    return false;
  }
  const workspaces = pkg["workspaces"];
  return (
    Array.isArray(workspaces) ||
    (typeof workspaces === "object" && workspaces !== null)
  );
};

/**
 * Discovers frontend apps in the repo. Returns a single `.` entry for
 * single-package repos; multiple entries for monorepos with several UIs.
 *
 * Symlinked directories are skipped: `statSync` would follow them and allow a
 * repo-seeded link to an out-of-tree path to appear as a selectable app.
 */
export const discoverFrontendApps = (projectRoot: string): DiscoveredApp[] => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  const apps: DiscoveredApp[] = [];
  const seen = new Set<string>();

  const addApp = (absDir: string, pkg: Record<string, unknown> | null) => {
    if (!isRealDirectoryInsideProject(realRoot, absDir)) {
      return;
    }
    const isRoot = absDir === realRoot || resolve(absDir) === realRoot;
    if (!pkg || !looksLikeFrontendApp(absDir, pkg, { isRoot })) {
      return;
    }
    const rel = isRoot ? "." : relative(realRoot, absDir) || ".";
    // Belt-and-braces: never surface a path that escapes the repo.
    if (rel !== "." && (isAbsolute(rel) || rel.startsWith(".."))) {
      return;
    }
    if (seen.has(rel)) {
      return;
    }
    seen.add(rel);
    const packageName = typeof pkg["name"] === "string" ? pkg["name"] : null;
    apps.push({
      path: rel,
      name: packageName ?? basename(absDir),
      packageName,
    });
  };

  const rootPkg = readJson(join(realRoot, "package.json"));
  addApp(realRoot, rootPkg);

  if (!isMonorepoRoot(realRoot) && apps.length > 0) {
    return apps;
  }

  for (const dir of WORKSPACE_DIRS) {
    const base = join(realRoot, dir);
    // Skip symlinked workspace roots (and anything that isn't a real dir).
    if (!isRealDirectoryInsideProject(realRoot, base)) {
      continue;
    }
    let children: string[];
    try {
      children = readdirSync(base);
    } catch {
      continue;
    }
    for (const child of children) {
      if (child === "node_modules") {
        continue;
      }
      const childAbs = join(base, child);
      if (!isRealDirectoryInsideProject(realRoot, childAbs)) {
        continue;
      }
      addApp(childAbs, readJson(join(childAbs, "package.json")));
      // One more level (e.g. packages/frontend/web)
      try {
        for (const nested of readdirSync(childAbs)) {
          if (nested === "node_modules") {
            continue;
          }
          const nestedAbs = join(childAbs, nested);
          if (!isRealDirectoryInsideProject(realRoot, nestedAbs)) {
            continue;
          }
          addApp(nestedAbs, readJson(join(nestedAbs, "package.json")));
        }
      } catch {
        // ignore unreadable dirs
      }
    }
  }

  if (apps.length === 0) {
    return [
      {
        path: ".",
        name: basename(realRoot),
        packageName:
          typeof rootPkg?.["name"] === "string" ? rootPkg["name"] : null,
      },
    ];
  }

  // Repo root first, then nested apps alphabetically.
  return apps.sort((a, b) => {
    if (a.path === ".") return -1;
    if (b.path === ".") return 1;
    return a.path.localeCompare(b.path);
  });
};

/**
 * Resolves a discovered app path to an absolute directory that is verified to
 * stay inside the project root (no symlink escape).
 */
export const resolveSelectedAppAbsolutePath = (
  projectRoot: string,
  selectedAppPath: string,
): string => {
  const realRoot = resolveRealProjectRoot(projectRoot);
  if (selectedAppPath === "." || selectedAppPath === "") {
    return realRoot;
  }
  if (
    isAbsolute(selectedAppPath) ||
    selectedAppPath.split(/[/\\]/u).includes("..")
  ) {
    throw new CliUserError(
      `Refusing app path that escapes the project root: ${selectedAppPath}`,
    );
  }
  const absolute = resolve(realRoot, selectedAppPath);
  if (!isRealDirectoryInsideProject(realRoot, absolute)) {
    throw new CliUserError(
      `Refusing app path that is missing, not a directory, or a symlink outside the repo: ${selectedAppPath}`,
    );
  }
  if (!isPathInsideRoot(realRoot, absolute)) {
    throw new CliUserError(
      `Refusing app path outside the project root: ${selectedAppPath}`,
    );
  }
  return absolute;
};

export const promptForMonorepoApp = async (
  apps: DiscoveredApp[],
): Promise<DiscoveredApp> => {
  if (apps.length === 0) {
    throw new CliUserError("No frontend apps discovered in this repository.");
  }
  if (apps.length === 1) {
    return apps[0];
  }

  console.log("");
  console.log(
    chalk.bold(
      `This looks like a monorepo with ${apps.length} frontend apps. Which one should we onboard?`,
    ),
  );

  const selectedPath = await search({
    message: "Select the frontend app to onboard:",
    source: (input: string | undefined) => {
      const term = (input ?? "").trim().toLowerCase();
      const filtered = term
        ? apps.filter(
            (app) =>
              app.name.toLowerCase().includes(term) ||
              app.path.toLowerCase().includes(term) ||
              (app.packageName?.toLowerCase().includes(term) ?? false),
          )
        : apps;
      if (filtered.length === 0) {
        return [
          {
            name: "No apps match that filter",
            value: "",
            disabled: true,
          },
        ];
      }
      return filtered.map((app) => {
        const location = app.path === "." ? "repo root" : app.path;
        return {
          name:
            app.packageName && app.packageName !== app.name
              ? `${app.name} (${location}) — ${app.packageName}`
              : `${app.name} (${location})`,
          value: app.path,
        };
      });
    },
  });

  const selected = apps.find((app) => app.path === selectedPath);
  if (!selected) {
    throw new CliUserError("Selected app not found in the discovered list.");
  }
  return selected;
};
