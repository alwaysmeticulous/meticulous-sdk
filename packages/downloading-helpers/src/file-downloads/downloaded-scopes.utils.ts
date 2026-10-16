import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileExists } from "./local-data.utils";

/** One scope per line, for every scope fully downloaded into the directory. */
export const DOWNLOADED_SCOPES_FILE_NAME = "downloaded-scopes.txt";
/** Single scope, as written by older versions; still read, no longer written. */
export const LEGACY_PREVIOUSLY_DOWNLOADED_FILE_NAME =
  "previously-downloaded.txt";

/**
 * The scopes recorded in `dir` that this version knows. A scope recorded by a
 * newer version is skipped, so it only counts as not downloaded.
 */
export const readDownloadedScopes = async <Scope extends string>(
  dir: string,
  knownScopes: readonly Scope[],
): Promise<Scope[]> => {
  const isKnownScope = (value: string): value is Scope =>
    (knownScopes as readonly string[]).includes(value);

  const scopes = new Set<Scope>();
  for (const fileName of [
    DOWNLOADED_SCOPES_FILE_NAME,
    LEGACY_PREVIOUSLY_DOWNLOADED_FILE_NAME,
  ]) {
    for (const line of await readScopeLines(join(dir, fileName))) {
      if (isKnownScope(line)) {
        scopes.add(line);
      }
    }
  }
  return [...scopes];
};

/** Keeps every scope already recorded, including ones this version doesn't know. */
export const recordDownloadedScope = async <Scope extends string>(
  dir: string,
  previousScopes: readonly Scope[],
  scope: Scope,
): Promise<void> => {
  const filePath = join(dir, DOWNLOADED_SCOPES_FILE_NAME);
  const lines = new Set([
    ...(await readScopeLines(filePath)),
    ...previousScopes,
    scope,
  ]);
  await writeFile(filePath, [...lines].join("\n"), "utf-8");
};

const readScopeLines = async (filePath: string): Promise<string[]> => {
  if (!(await fileExists(filePath))) {
    return [];
  }
  return (await readFile(filePath, "utf-8"))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
};
