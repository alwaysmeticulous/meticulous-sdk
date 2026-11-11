import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
  syncHandler,
} from "../shared/helper-options";
import { readTryContext } from "../shared/try-context";
import { resolveCommit } from "../worktree/worktrees";
import {
  acquireBuildSlot,
  DEFAULT_LEASE_SECONDS,
  releaseBuildSlot,
  slotDirs,
  WAITER_STALE_MS,
} from "./build-slots";
import { defaultBuildSlots } from "./default-build-slots";
import {
  defaultMachineRegistryDir,
  registerSlotWorkspace,
  sharedSlotCount,
} from "./machine-slot-share";
import { orderFreeSlotsByAffinity, slotWorktreeInfo } from "./slot-worktrees";

const OWNER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** Below Claude Code's 10-minute limit on a foreground command. */
const DEFAULT_WAIT_SECONDS = 540;

interface AcquireOptions {
  cwd: string | undefined;
  json: boolean;
  owner: string;
  rank: number;
  sha: string | undefined;
  waitSeconds: number;
  leaseSeconds: number;
}

interface ReleaseOptions {
  cwd: string | undefined;
  json: boolean;
  owner: string;
}

const acquireHandler = async (options: AcquireOptions): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  const configuredSlots =
    readTryContext(repoRoot)?.buildSlots ?? defaultBuildSlots();
  const targetSha = options.sha ? resolveCommit(repoRoot, options.sha) : null;
  const dirs = slotDirs(repoRoot);
  const registryDir = defaultMachineRegistryDir();
  registerSlotWorkspace(registryDir, dirs);
  const result = await acquireBuildSlot({
    dirs,
    slotCount: (now) =>
      sharedSlotCount({
        registryDir,
        ownDirs: dirs,
        slotCount: configuredSlots,
        leaseSeconds: options.leaseSeconds,
        waiterStaleMs: WAITER_STALE_MS,
        now,
      }),
    owner: assertOwner(options.owner),
    rank: options.rank,
    waitSeconds: options.waitSeconds,
    leaseSeconds: options.leaseSeconds,
    orderFreeSlots: orderFreeSlotsByAffinity({ repoRoot, targetSha }),
  });
  const worktree =
    result.slot != null ? slotWorktreeInfo(repoRoot, result.slot) : null;
  const sharedNote =
    result.slotCount < configuredSlots
      ? ` (${configuredSlots} shared with other trials running on this machine)`
      : "";
  printResult(options.json, { ...result, configuredSlots, worktree }, () => [
    result.acquired && worktree
      ? `Acquired build slot ${result.slot} of ${result.slotCount}${sharedNote} after ${result.waitedSeconds}s; ` +
        `its worktree is ${worktree.name} (${worktree.sha ? `at ${worktree.sha.slice(0, 12)}` : "not created yet"})`
      : `No build slot free after ${result.waitedSeconds}s (${result.ahead} waiting ahead); run this again to keep your place`,
  ]);
};

const releaseHandler = (options: ReleaseOptions): void => {
  const repoRoot = repoRootFrom(options.cwd);
  const released = releaseBuildSlot(
    slotDirs(repoRoot),
    assertOwner(options.owner),
  );
  printResult(options.json, { released }, () => [
    released ? "Released the build slot" : "No build slot held by that owner",
  ]);
};

const assertOwner = (owner: string): string => {
  if (!OWNER.test(owner)) {
    throw new CliUserError(
      `Invalid slot owner '${owner}': use letters, digits, '.', '_' or '-' (e.g. pr-123-build).`,
    );
  }
  return owner;
};

const OWNER_OPTION = {
  string: true,
  demandOption: true,
  description: "Who holds the slot, e.g. pr-123-install",
} as const;

const slotAcquireCommand: CommandModule<unknown, AcquireOptions> = {
  command: "acquire",
  describe:
    "Wait for a free build slot (installs and builds share a few, so they never all run at once). Each slot leases the warm worktree slot-<n>, whose install and build caches carry over between holders. Prints acquired: false if none came free in time; run it again to keep your place",
  builder: {
    ...HELPER_OPTIONS,
    owner: OWNER_OPTION,
    rank: {
      number: true,
      default: 100,
      description:
        "Queue priority, lower first: the PR's rank, so the most promising PRs finish first",
    },
    sha: {
      string: true,
      description:
        "The commit about to be built; the free slot whose worktree is closest to it in history is leased, so the switch and rebuild stay small",
    },
    waitSeconds: {
      number: true,
      default: DEFAULT_WAIT_SECONDS,
      description: "How long to wait before giving up for now",
    },
    leaseSeconds: {
      number: true,
      default: DEFAULT_LEASE_SECONDS,
      description:
        "After this long a slot that was never released is handed to the next waiter",
    },
  },
  handler: wrapHandler(acquireHandler),
};

const slotReleaseCommand: CommandModule<unknown, ReleaseOptions> = {
  command: "release",
  describe: "Release the build slot held by --owner",
  builder: { ...HELPER_OPTIONS, owner: OWNER_OPTION },
  handler: wrapHandler(syncHandler(releaseHandler)),
};

export const slotCommand: CommandModule = {
  command: "slot",
  describe:
    "Share a few build slots (each leasing a warm slot-<n> worktree) between backtesters so installs and builds don't all run at once",
  builder: (yargs) =>
    yargs
      .command(slotAcquireCommand)
      .command(slotReleaseCommand)
      .demandCommand(),
  handler: () => {
    // subcommand handles this
  },
};
