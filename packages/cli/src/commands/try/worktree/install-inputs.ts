import { runGit } from "../shared/run-git";

/**
 * Files whose change can make an existing node_modules stale. A manifest
 * change that alters dependencies also changes the lockfile, so manifests
 * themselves are left out: most PRs edit package.json scripts or versions only.
 */
export const INSTALL_INPUT_PATHSPECS = [
  ":(glob)**/package-lock.json",
  ":(glob)**/npm-shrinkwrap.json",
  ":(glob)**/pnpm-lock.yaml",
  ":(glob)**/pnpm-workspace.yaml",
  ":(glob)**/yarn.lock",
  ":(glob)**/bun.lock",
  ":(glob)**/bun.lockb",
  ":(glob)**/.npmrc",
  ":(glob)**/.yarnrc",
  ":(glob)**/.yarnrc.yml",
  ":(glob).yarn/releases/**",
  ":(glob).yarn/patches/**",
  ":(glob)**/patches/**",
  ":(glob).nvmrc",
  ":(glob).node-version",
  ":(glob).tool-versions",
];

export const listChangedInstallInputs = (
  repoRoot: string,
  fromSha: string,
  toSha: string,
): string[] =>
  runGit(repoRoot, [
    "diff",
    "--name-only",
    fromSha,
    toSha,
    "--",
    ...INSTALL_INPUT_PATHSPECS,
  ])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
