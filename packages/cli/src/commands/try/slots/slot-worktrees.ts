import { tryRunGit } from "../shared/run-git";
import {
  slotWorktreeName,
  tryWorktreeHeadSha,
  worktreePath,
} from "../worktree/worktrees";

/** The warm worktree a build slot leases along with the slot. */
export interface SlotWorktree {
  name: string;
  path: string;
  /** HEAD of the worktree, or null when it has not been created yet. */
  sha: string | null;
}

export const slotWorktreeInfo = (
  repoRoot: string,
  slot: number,
): SlotWorktree => {
  const name = slotWorktreeName(slot);
  return {
    name,
    path: worktreePath(repoRoot, name),
    sha: tryWorktreeHeadSha(repoRoot, name),
  };
};

/** Costlier than any real commit distance: switching even a far-away worktree
 * keeps its node_modules and build caches, whereas a slot with no worktree yet
 * means a full checkout. */
const NO_WORKTREE_COST = Number.MAX_SAFE_INTEGER;
const UNKNOWN_DISTANCE = Number.MAX_SAFE_INTEGER - 1;

/**
 * Orders free build slots so the commit about to be built lands on the warm
 * worktree whose HEAD is closest to it in history (smallest switch, most
 * incremental rebuild), preferring any existing worktree over creating one.
 */
export const orderFreeSlotsByAffinity = (options: {
  repoRoot: string;
  targetSha: string | null;
}): ((freeSlots: number[]) => number[]) => {
  const { repoRoot, targetSha } = options;
  const distanceByWorktreeSha = new Map<string, number>();
  const cost = (slot: number): number => {
    const worktreeSha = tryWorktreeHeadSha(repoRoot, slotWorktreeName(slot));
    if (worktreeSha == null) {
      return NO_WORKTREE_COST;
    }
    if (targetSha == null || targetSha === worktreeSha) {
      return 0;
    }
    const memoized = distanceByWorktreeSha.get(worktreeSha);
    if (memoized != null) {
      return memoized;
    }
    const distance = commitDistance(repoRoot, targetSha, worktreeSha);
    distanceByWorktreeSha.set(worktreeSha, distance);
    return distance;
  };
  return (freeSlots) =>
    freeSlots
      .map((slot) => ({ slot, cost: cost(slot) }))
      .sort((a, b) => a.cost - b.cost || a.slot - b.slot)
      .map((entry) => entry.slot);
};

/** Commits in the symmetric difference between the two, i.e. how far apart they are. */
const commitDistance = (repoRoot: string, a: string, b: string): number => {
  const counted = tryRunGit(repoRoot, ["rev-list", "--count", `${a}...${b}`]);
  const distance = counted == null ? Number.NaN : Number.parseInt(counted, 10);
  return Number.isFinite(distance) ? distance : UNKNOWN_DISTANCE;
};
