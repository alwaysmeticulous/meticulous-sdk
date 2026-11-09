import { existsSync } from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { TRY_WORKDIR, absoluteTryPath } from "../shared/try-paths";

export const hasExistingTryWorkspace = (repoRoot: string): boolean =>
  existsSync(absoluteTryPath(repoRoot, TRY_WORKDIR));

/**
 * Asks whether a re-run should pick up the existing `.meticulous-try/`
 * workspace (and its trial project) or discard it and start from scratch in a
 * brand-new trial project.
 */
export const confirmContinueWithExistingWorkspace =
  async (): Promise<boolean> => {
    console.log(
      `Found an existing ${chalk.cyan(`${TRY_WORKDIR}/`)} workspace from a previous run.`,
    );
    console.log(
      chalk.dim(
        "  Answering no deletes it and starts from scratch in a new trial project.",
      ),
    );
    const { continueExisting } = await inquirer.prompt<{
      continueExisting: boolean;
    }>([
      {
        type: "confirm",
        name: "continueExisting",
        message: "Continue using it?",
        default: true,
      },
    ]);
    return continueExisting;
  };
