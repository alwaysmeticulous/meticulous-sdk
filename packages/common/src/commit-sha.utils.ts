import { exec } from "child_process";
import { initLogger } from "./logger/console-logger";

const getGitRevParseHead: () => Promise<string> = () => {
  return new Promise((resolve, reject) => {
    exec("git rev-parse HEAD", { encoding: "utf-8" }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    });
  });
};

export const getCommitSha: (
  commitSha: string | null | undefined,
) => Promise<string> = async (commitSha_) => {
  if (commitSha_) {
    return commitSha_;
  }

  const logger = initLogger();

  try {
    const gitCommitSha = (await getGitRevParseHead()).trim();
    return gitCommitSha;
  } catch (error) {
    // Suppress error logging if not in a git repository
    if (error instanceof Error) {
      if (error.message.startsWith("Command failed")) {
        logger.info("Notice: not running in a git repository");
        return "";
      }
    }
    logger.error(error);
    return "";
  }
};

const getGitCommitDate: (commitSha: string) => Promise<string> = (
  commitSha,
) => {
  return new Promise((resolve, reject) => {
    exec(
      `git show -s --format=%cI ${commitSha}`,
      { encoding: "utf-8" },
      (error, output) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(output);
      },
    );
  });
};

export const getCommitDate: (
  commitDate: string | null | undefined,
  commitSha: string,
) => Promise<string> = async (commitDate_, commitSha) => {
  if (commitDate_) {
    return commitDate_;
  }

  const logger = initLogger();

  try {
    const gitCommitDate = (await getGitCommitDate(commitSha)).trim();
    return gitCommitDate;
  } catch (error) {
    // Suppress error logging if not in a git repository
    if (error instanceof Error) {
      if (error.message.startsWith("Command failed")) {
        logger.info(
          "Notice: not running in a git repository (cannot get commit date)",
        );
        return "";
      }
    }
    logger.error(error);
    return "";
  }
};
