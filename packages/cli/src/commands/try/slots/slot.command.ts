import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import { mkdirSafeSync } from "../../onboard/safe-repo-fs";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
  syncHandler,
} from "../shared/helper-options";
import { readTryContext } from "../shared/try-context";
import { TRY_PATHS } from "../shared/try-paths";
import {
  acquireBuildSlot,
  releaseBuildSlot,
  type SlotDirs,
} from "./build-slots";
import { defaultBuildSlots } from "./default-build-slots";

const OWNER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** Below Claude Code's 10-minute limit on a foreground command. */
const DEFAULT_WAIT_SECONDS = 540;
const DEFAULT_LEASE_SECONDS = 45 * 60;

interface AcquireOptions {
  cwd: string | undefined;
  json: boolean;
  owner: string;
  rank: number;
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
  const slotCount = readTryContext(repoRoot)?.buildSlots ?? defaultBuildSlots();
  const result = await acquireBuildSlot({
    dirs: slotDirs(repoRoot),
    slotCount,
    owner: assertOwner(options.owner),
    rank: options.rank,
    waitSeconds: options.waitSeconds,
    leaseSeconds: options.leaseSeconds,
  });
  printResult(options.json, { ...result, slotCount }, () => [
    result.acquired
      ? `Acquired build slot ${result.slot} of ${slotCount} after ${result.waitedSeconds}s`
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

const slotDirs = (repoRoot: string): SlotDirs => ({
  held: mkdirSafeSync(repoRoot, `${TRY_PATHS.slots}/held`),
  waiting: mkdirSafeSync(repoRoot, `${TRY_PATHS.slots}/waiting`),
});

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
    "Wait for a free build slot (installs and builds share a few, so they never all run at once). Prints acquired: false if none came free in time; run it again to keep your place",
  builder: {
    ...HELPER_OPTIONS,
    owner: OWNER_OPTION,
    rank: {
      number: true,
      default: 100,
      description:
        "Queue priority, lower first: the PR's rank, so the most promising PRs finish first",
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
    "Share a few build slots between backtesters so installs and builds don't all run at once",
  builder: (yargs) =>
    yargs
      .command(slotAcquireCommand)
      .command(slotReleaseCommand)
      .demandCommand(),
  handler: () => {
    // subcommand handles this
  },
};
