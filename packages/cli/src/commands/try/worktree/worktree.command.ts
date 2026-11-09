import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
} from "../shared/helper-options";
import { createTryWorktree, removeTryWorktree } from "./worktrees";

interface WorktreeOptions {
  cwd: string | undefined;
  json: boolean;
  sha: string | undefined;
  name: string | undefined;
  remove: string | undefined;
  clean: string[] | undefined;
}

const worktreeHandler = async (options: WorktreeOptions): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  if (options.remove) {
    const result = removeTryWorktree({ repoRoot, name: options.remove });
    printResult(options.json, result, () => [
      result.removed
        ? `Removed worktree ${result.name}`
        : `No worktree named ${result.name}`,
    ]);
    return;
  }
  if (!options.sha || !options.name) {
    throw new CliUserError(
      "Pass --sha and --name to create a worktree, or --remove <name>.",
    );
  }
  const worktree = await createTryWorktree({
    repoRoot,
    sha: options.sha,
    name: options.name,
    cleanPaths: options.clean ?? [],
  });
  printResult(options.json, worktree, () => [worktree.path]);
};

export const worktreeCommand: CommandModule<unknown, WorktreeOptions> = {
  command: "worktree",
  describe:
    "Check out a commit in a detached git worktree under .meticulous-try/worktrees/<name> (prints its path), switching an existing one in place so its install is kept. A new worktree's node_modules are copied from an existing checkout (copy-on-write where the filesystem supports it); --json reports whether install inputs changed and what seeded it. Or remove one",
  builder: {
    ...HELPER_OPTIONS,
    sha: { string: true, description: "Commit to check out" },
    name: {
      string: true,
      description:
        "Worktree name: the slot worktree a build slot leased (e.g. slot-0), or a dedicated name",
    },
    remove: { string: true, description: "Name of a worktree to remove" },
    clean: {
      string: true,
      array: true,
      description:
        "Worktree-relative paths to delete after checking out, e.g. the build output dir, so a previous commit's build is never reused",
    },
  },
  handler: wrapHandler(worktreeHandler),
};
