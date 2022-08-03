import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { exec } from "child_process";
import log from "loglevel";

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
  commitSha: string | null | undefined
) => Promise<string> = async (commitSha_) => {
  if (commitSha_) {
    return commitSha_;
  }

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

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
