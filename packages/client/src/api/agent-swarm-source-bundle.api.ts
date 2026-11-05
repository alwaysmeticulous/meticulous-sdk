import type { MeticulousClient } from "../types/client.types";
import type { ProjectIdentifier } from "./project-deployments.api";
import { projectIdQuery } from "./project-deployments.api";

/**
 * The refs of the git bundle `ci agent-test --uploadSource` uploads: a
 * synthetic two-commit repository whose root commit holds the change's base
 * tree and whose child holds its head tree, so the bundle carries the diff and
 * both trees without the repository's history. The worker that reads it uses
 * the same names.
 */
export const AGENT_SWARM_SOURCE_BUNDLE_BASE_BRANCH = "meticulous-base";
export const AGENT_SWARM_SOURCE_BUNDLE_HEAD_BRANCH = "meticulous-head";

export interface RequestAgentSwarmSourceBundleUploadParams extends ProjectIdentifier {
  size: number;
}

export interface RequestAgentSwarmSourceBundleUploadResponse {
  uploadUrl: string;
  /** Server-minted id the launch names the uploaded bundle by. */
  sourceBundleId: string;
}

/**
 * A presigned URL to PUT the bundle to. Only for projects without a hosting
 * provider: the backend refuses one whose source it reads from GitHub, GitLab
 * or Bitbucket.
 */
export const requestAgentSwarmSourceBundleUpload = async ({
  client,
  projectId,
  ...body
}: RequestAgentSwarmSourceBundleUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAgentSwarmSourceBundleUploadResponse> => {
  const { data } =
    await client.post<RequestAgentSwarmSourceBundleUploadResponse>(
      "agentic-session-generation/request-source-bundle-upload",
      body,
      projectIdQuery(projectId),
    );
  return data;
};
