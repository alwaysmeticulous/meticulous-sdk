import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
} from "../shared/helper-options";
import { readTryContext } from "../shared/try-context";
import { defaultBuildSlots } from "../slots/default-build-slots";
import { defaultPrewarmShas, prewarmSlotWorktrees } from "./prewarm";
import { resolveCommit } from "./worktrees";

interface PrewarmOptions {
  cwd: string | undefined;
  json: boolean;
  shas: string[] | undefined;
}

const prewarmHandler = async (options: PrewarmOptions): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  const slotCount = readTryContext(repoRoot)?.buildSlots ?? defaultBuildSlots();
  const shas =
    options.shas && options.shas.length > 0
      ? options.shas.map((sha) => resolveCommit(repoRoot, sha))
      : defaultPrewarmShas(repoRoot);
  const results = await prewarmSlotWorktrees({ repoRoot, slotCount, shas });
  printResult(options.json, { slotCount, results }, () =>
    results.map(
      (result) =>
        `${result.worktree}: ${result.status}` +
        (result.sha ? ` at ${result.sha.slice(0, 12)}` : "") +
        (result.error ? ` (${result.error})` : ""),
    ),
  );
};

export const prewarmCommand: CommandModule<unknown, PrewarmOptions> = {
  command: "prewarm",
  describe:
    "Create every missing slot worktree now, all in parallel (checked out at the top candidate PRs' base commits, or --shas), so the backtesters' build slots start with warm worktrees instead of paying for checkouts one by one",
  builder: {
    ...HELPER_OPTIONS,
    shas: {
      string: true,
      array: true,
      description:
        "Commits to spread the new worktrees across (defaults to the candidate PRs' base commits, else HEAD)",
    },
  },
  handler: wrapHandler(prewarmHandler),
};
