import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { CliUserError } from "../../utils/cli-user-error";

/** The proxy path that sends every request to the preview. */
export const PREVIEW_URL_SWARM_PROXY_PATHS = ["/"];

/**
 * Refuses options a preview-URL Agent swarm launch can't use. The live preview
 * at --backendUrl serves the whole app, backend included, so there is no build
 * to upload, no container to start and nothing to mock.
 */
export const assertPreviewUrlAgentSwarmOptions = ({
  backendUrl,
  backendProxyPaths,
  conflictingOptionsGiven,
}: {
  backendUrl: string | undefined;
  backendProxyPaths: string[] | undefined;
  /**
   * Whether any of --previewUrl, --basePreviewUrl, --deploymentId,
   * --localImageTag, --enableLocalMocks, --appPort, --backendUrlEnvVariable or
   * a container option was given.
   */
  conflictingOptionsGiven: boolean;
}): void => {
  if (!backendUrl) {
    throw new CliUserError(
      "--previewUrlAgentSwarm needs --backendUrl: the origin of the live preview to test.",
    );
  }
  if (conflictingOptionsGiven) {
    throw new CliUserError(
      "--previewUrlAgentSwarm can't be combined with --previewUrl, --basePreviewUrl, --deploymentId, --localImageTag, --enableLocalMocks, --appPort, --backendUrlEnvVariable or container options: the preview at --backendUrl serves the whole app.",
    );
  }
  if (
    backendProxyPaths != null &&
    !backendProxyPaths.some((path) => path.replace(/\/+$/, "") === "")
  ) {
    throw new CliUserError(
      "--previewUrlAgentSwarm needs the preview to serve every path: leave out --backendProxyPaths, or pass --backendProxyPaths=/.",
    );
  }
};

/**
 * The upload a preview-URL launch sends when no --assetsDir is given. The
 * preview serves every path, so nothing in it is ever served; the launch API
 * still expects an uploaded build.
 */
export const writePreviewUrlPlaceholderAssets = async (): Promise<string> => {
  const directory = await mkdtemp(
    join(tmpdir(), "meticulous-preview-url-agent-swarm-"),
  );
  await writeFile(join(directory, "index.html"), "<!doctype html>\n");
  return directory;
};
