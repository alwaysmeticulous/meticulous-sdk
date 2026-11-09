import { existsSync } from "fs";
import { readWorkspaceJson } from "../shared/helper-options";
import { TRY_PATHS } from "../shared/try-paths";
import {
  DEFAULT_LEASE_SECONDS,
  releaseBuildSlot,
  slotDirs,
  tryClaimSlot,
  type SlotDirs,
} from "../slots/build-slots";
import {
  createTryWorktree,
  resolveCommit,
  slotWorktreeName,
  worktreePath,
  type TryWorktree,
} from "./worktrees";

export type PrewarmSlotStatus =
  | "created"
  | "already-exists"
  | "slot-held"
  | "failed";

export interface PrewarmSlotResult {
  slot: number;
  worktree: string;
  status: PrewarmSlotStatus;
  /** The commit a created worktree was checked out at. */
  sha: string | null;
  seededFrom: TryWorktree["seededFrom"];
  error?: string;
}

/**
 * Creates every slot worktree that does not exist yet, all in parallel, so the
 * checkouts and node_modules copies happen once up front instead of one by one
 * inside phase 4's build-slot critical path. Each creation briefly claims its
 * slot, so a backtester never races a half-created worktree; a slot that is
 * already held is skipped (its holder owns the worktree).
 */
export const prewarmSlotWorktrees = async (options: {
  repoRoot: string;
  slotCount: number;
  /** Resolved commits to spread the new worktrees across, round-robin. */
  shas: string[];
}): Promise<PrewarmSlotResult[]> => {
  const dirs = slotDirs(options.repoRoot);
  return Promise.all(
    Array.from({ length: options.slotCount }, (_, slot) =>
      prewarmSlot({
        repoRoot: options.repoRoot,
        dirs,
        slot,
        sha: options.shas[slot % options.shas.length],
      }),
    ),
  );
};

const prewarmSlot = async (options: {
  repoRoot: string;
  dirs: SlotDirs;
  slot: number;
  sha: string;
}): Promise<PrewarmSlotResult> => {
  const { repoRoot, dirs, slot, sha } = options;
  const name = slotWorktreeName(slot);
  if (existsSync(worktreePath(repoRoot, name))) {
    return skipped(slot, name, "already-exists");
  }
  const owner = `prewarm-${name}`;
  if (!tryClaimSlot(dirs, slot, owner, DEFAULT_LEASE_SECONDS)) {
    return skipped(slot, name, "slot-held");
  }
  try {
    const worktree = await createTryWorktree({ repoRoot, sha, name });
    return {
      slot,
      worktree: name,
      status: "created",
      sha,
      seededFrom: worktree.seededFrom,
    };
  } catch (error) {
    return {
      ...skipped(slot, name, "failed"),
      sha,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    releaseBuildSlot(dirs, owner);
  }
};

const skipped = (
  slot: number,
  worktree: string,
  status: PrewarmSlotStatus,
): PrewarmSlotResult => ({
  slot,
  worktree,
  status,
  sha: null,
  seededFrom: null,
});

/**
 * The commits worth prewarming at when none are given: the top candidate PRs'
 * base commits (what the backtesters build first), else HEAD.
 */
export const defaultPrewarmShas = (repoRoot: string): string[] => {
  const candidates =
    readWorkspaceJson<{ candidates?: Array<{ baseSha?: unknown }> }>(
      repoRoot,
      TRY_PATHS.candidates,
    )?.candidates ?? [];
  const resolved = [
    ...new Set(
      candidates
        .map((candidate) => candidate.baseSha)
        .filter((sha): sha is string => typeof sha === "string"),
    ),
  ].flatMap((sha) => {
    try {
      return [resolveCommit(repoRoot, sha)];
    } catch {
      return [];
    }
  });
  return resolved.length > 0 ? resolved : [resolveCommit(repoRoot, "HEAD")];
};
