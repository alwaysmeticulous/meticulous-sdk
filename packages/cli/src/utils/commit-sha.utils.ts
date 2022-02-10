import { exec } from "child_process";

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

  try {
    const gitCommitSha = (await getGitRevParseHead()).trim();
    return gitCommitSha;
  } catch (error) {
    console.error(error);
    return "";
  }
};
