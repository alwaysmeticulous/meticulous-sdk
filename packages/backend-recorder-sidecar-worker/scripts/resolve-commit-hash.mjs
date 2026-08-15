import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The commit this package was last changed in, mirroring `getCommitPackageLastModifiedIn` from the
 * internal `@alwaysmeticulous/scripts` package that the webpack- and esbuild-built packages call.
 * Reimplemented here rather than imported: everything under `public_packages/` is mirrored to the
 * public meticulous-sdk repo, where a `workspace:*` dependency on a private package would not
 * resolve.
 *
 * "Last changed in" rather than `HEAD`, so the value only moves when this package or one of its
 * workspace dependencies does — which is exactly when turbo rebuilds. A `HEAD`-based value would
 * otherwise survive in a cache hit and be stamped onto recordings it does not describe.
 */
export const resolveCommitHash = (packageName) => {
  const fromEnv = process.env.METICULOUS_COMMIT_HASH;
  if (fromEnv) {
    return fromEnv;
  }

  let gitRoot;
  try {
    gitRoot = execSync("git rev-parse --show-toplevel").toString().trim();
  } catch {
    // No git, e.g. a build from a published tarball or inside a Docker image.
    return "unknown";
  }

  const paths = [...workspaceDirs(gitRoot, packageName), "pnpm-lock.yaml"];
  const git = (command) =>
    execSync(`${command} -- ${paths.join(" ")}`, { cwd: gitRoot })
      .toString()
      .trim();

  const commitHash = git("git log -n 1 --pretty=format:%H");
  const isClean = !git("git status --porcelain");
  return isClean ? commitHash : `${commitHash}-unclean`;
};

/** The package's own directory, plus those of the workspace packages it depends on, transitively. */
const workspaceDirs = (gitRoot, packageName) => {
  const dirs = new Set();
  const queue = [packageName];

  while (queue.length > 0) {
    const dir = `public_packages/${queue.shift()}`;
    const manifestPath = join(gitRoot, dir, "package.json");
    if (dirs.has(dir) || !existsSync(manifestPath)) {
      continue;
    }
    dirs.add(dir);

    const { dependencies, devDependencies } = JSON.parse(
      readFileSync(manifestPath, "utf-8"),
    );
    for (const [dependency, range] of Object.entries({
      ...dependencies,
      ...devDependencies,
    })) {
      if (range.startsWith("workspace:")) {
        queue.push(dependency.replace("@alwaysmeticulous/", ""));
      }
    }
  }

  return [...dirs];
};
