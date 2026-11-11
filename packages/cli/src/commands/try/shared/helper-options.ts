import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { OPTIONS } from "../../../command-utils/common-options";
import { printJson } from "../../../command-utils/print-json";
import { writeFileSafeSync } from "../../onboard/safe-repo-fs";
import { resolveRepoRoot } from "./run-git";
import { absoluteTryPath } from "./try-paths";

export const HELPER_OPTIONS = {
  cwd: {
    string: true,
    description: "Path inside the app repository (defaults to cwd)",
  },
  json: {
    boolean: true,
    default: false,
    description: "Output the result as JSON on stdout",
  },
} as const;

export const HELPER_OPTIONS_WITH_TOKEN = {
  ...HELPER_OPTIONS,
  apiToken: {
    ...OPTIONS.apiToken,
    description:
      "Project API token. Defaults to .meticulous-try/try-context.json, then METICULOUS_API_TOKEN",
  },
} as const;

/** Adapts a synchronous handler for `wrapHandler`, turning a throw into a rejection. */
export const syncHandler =
  <T>(handler: (args: T) => void) =>
  (args: T): Promise<void> =>
    Promise.resolve().then(() => handler(args));

export const repoRootFrom = (cwd: string | undefined): string =>
  resolveRepoRoot(resolve(cwd ?? process.cwd()));

/** Prints `value` as JSON with `--json`, otherwise as the given text lines. */
export const printResult = (
  json: boolean,
  value: unknown,
  formatText: () => string[],
): void => {
  if (json) {
    printJson(value);
    return;
  }
  for (const line of formatText()) {
    console.log(line);
  }
};

export const writeWorkspaceJson = (
  repoRoot: string,
  relativePath: string,
  value: unknown,
): string =>
  writeFileSafeSync(
    repoRoot,
    relativePath,
    JSON.stringify(value, null, 2) + "\n",
  );

export const readWorkspaceJson = <T>(
  repoRoot: string,
  relativePath: string,
): T | null => {
  const path = absoluteTryPath(repoRoot, relativePath);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
};
