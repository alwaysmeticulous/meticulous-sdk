import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readdirSync, renameSync } from "fs";
import { basename, join } from "path";
import { mkdirSafeSync } from "../../onboard/safe-repo-fs";
import { TRY_PATHS } from "../shared/try-paths";

/**
 * Deletes each path's contents before its top-level `.gitignore`, so a
 * directory that ignores itself (`*`) never shows in `git status` mid-delete:
 * by the time the ignore file goes, the directory is empty, and git does not
 * list empty directories.
 */
const DELETE_SCRIPT =
  'const { readdirSync, rmSync } = require("fs");' +
  'const { join } = require("path");' +
  "const remove = (path) => { try { rmSync(path, { recursive: true, force: true }); } catch {} };" +
  "for (const path of process.argv.slice(1)) {" +
  "  let names = [];" +
  "  try { names = readdirSync(path); } catch {}" +
  '  for (const name of names) { if (name !== ".gitignore") { remove(join(path, name)); } }' +
  "  remove(path);" +
  "}";

/**
 * Moves `path` into `.meticulous-try/trash/` so its original location is free
 * at once. Returns false if it could not be moved (e.g. a file is locked on
 * Windows), in which case the caller should delete it in place.
 */
export const moveToTrash = (repoRoot: string, path: string): boolean => {
  const trashRoot = mkdirSafeSync(repoRoot, TRY_PATHS.trash);
  return tryRename(path, join(trashRoot, `${basename(path)}-${randomUUID()}`));
};

/** Deletes everything in the trash, including leftovers from an interrupted run. */
export const emptyTrashInBackground = (repoRoot: string): void => {
  const trashRoot = mkdirSafeSync(repoRoot, TRY_PATHS.trash);
  deleteInBackground(
    readdirSync(trashRoot).map((name) => join(trashRoot, name)),
  );
};

/**
 * Deletes `paths` from a detached process, so the command returns without
 * waiting on the tens of thousands of files in each worktree's node_modules.
 */
export const deleteInBackground = (paths: string[]): void => {
  if (paths.length === 0) {
    return;
  }
  spawn(process.execPath, ["-e", DELETE_SCRIPT, ...paths], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
};

export const tryRename = (from: string, to: string): boolean => {
  try {
    renameSync(from, to);
    return true;
  } catch {
    return false;
  }
};
