import type { Project } from "@alwaysmeticulous/api";
import {
  createClient,
  getApiToken,
  getProject,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { execFile } from "child_process";
import { promisify } from "util";
import { CliUserError } from "../../utils/cli-user-error";

const execFileAsync = promisify(execFile);

/** Mirrors the backend's check: the linked host must also be set up. */
export const projectHasHostingProvider = (project: Project): boolean => {
  if (project.hostKind === "GitHub") {
    return project.isGitHubIntegrationActive === true;
  }
  if (project.hostKind === "GitLab") {
    return project.isGitLabIntegrationActive === true;
  }
  if (project.hostKind === "Bitbucket") {
    return project.isBitbucketIntegrationActive === true;
  }
  if (project.hostKind === "None") {
    return false;
  }
  // An older backend that doesn't send hostKind.
  return (
    project.isGitHubIntegrationActive === true ||
    project.isGitLabIntegrationActive === true ||
    project.isBitbucketIntegrationActive === true
  );
};

/**
 * `--uploadSource` defaults to on exactly when the project has no hosting
 * provider to read the change's source from.
 */
export const resolveUploadSource = async ({
  uploadSource,
  apiToken,
  projectId,
}: {
  uploadSource: boolean | undefined;
  apiToken: string | null;
  projectId: string | undefined;
}): Promise<boolean> => {
  if (uploadSource != null) {
    return uploadSource;
  }
  const project = await getProject(
    createClient({ apiToken: getApiToken(apiToken) }),
    projectId,
  );
  if (project == null) {
    initLogger().warn(
      "Could not read the project to decide whether to upload source; not uploading it. Pass --uploadSource to upload it.",
    );
    return false;
  }
  return !projectHasHostingProvider(project);
};

/**
 * The full sha of `commitSha`, which must be what `repoDirectory` has checked
 * out: the change is read from that checkout, so a different HEAD there means
 * the caller pointed at the wrong worktree.
 */
export const resolveCheckedOutCommit = async ({
  repoDirectory,
  commitSha,
}: {
  repoDirectory: string;
  commitSha: string;
}): Promise<string> => {
  const revParse = async (rev: string): Promise<string | null> => {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`],
        { cwd: repoDirectory, encoding: "utf8" },
      );
      return stdout.trim();
    } catch {
      return null;
    }
  };
  const [resolved, head] = await Promise.all([
    revParse(commitSha),
    revParse("HEAD"),
  ]);
  if (head == null) {
    throw new CliUserError(
      `--repoDirectory ${repoDirectory} is not a git checkout with a commit checked out.`,
    );
  }
  if (resolved == null) {
    throw new CliUserError(
      `--commitSha ${commitSha} is not a commit in --repoDirectory ${repoDirectory}.`,
    );
  }
  if (resolved !== head) {
    throw new CliUserError(
      `--repoDirectory ${repoDirectory} has ${head} checked out, not --commitSha ${resolved}. ` +
        "Point --repoDirectory at a checkout (e.g. a git worktree) of --commitSha.",
    );
  }
  return resolved;
};
