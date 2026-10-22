import type { PiEntry } from "./pi-entry.types";

interface ActiveBranch {
  /** Root first. */
  path: PiEntry[];
  /** Entries on branches the user navigated away from with `/tree`. */
  abandonedEntryCount: number;
  /** Leaves of those branches, i.e. how many alternative endings there are. */
  abandonedBranchCount: number;
}

/**
 * Pi keeps every branch of a session in one append-only file and, on
 * reopening it, resumes from the last entry written, so that entry is the
 * leaf of the active branch.
 */
export const selectActiveBranch = (entries: PiEntry[]): ActiveBranch => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const path: PiEntry[] = [];
  const onPath = new Set<string>();
  let current = entries.at(-1);
  while (current && !onPath.has(current.id)) {
    path.push(current);
    onPath.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  path.reverse();

  const parentIds = new Set(entries.map((entry) => entry.parentId));
  const abandoned = entries.filter((entry) => !onPath.has(entry.id));
  return {
    path,
    abandonedEntryCount: abandoned.length,
    abandonedBranchCount: abandoned.filter((entry) => !parentIds.has(entry.id))
      .length,
  };
};
