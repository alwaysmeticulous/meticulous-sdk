import type {
  AssetUploadMetadata,
  CompanionAssetsInfo,
  DeploymentArchiveType,
  DownloadDeploymentResponse,
  SessionFilter,
  TestRun,
} from "@alwaysmeticulous/api";
import type { MeticulousClient } from "../types/client.types";

/**
 * Identifies a project for OAuth callers, whose token does not by itself
 * pin a project. The id is the one returned by `oauth/projects` and
 * persisted via `meticulous auth set-project`. Omitted when authenticating
 * with a project-scoped API token (the token already pins the project).
 */
export interface ProjectIdentifier {
  projectId?: string | undefined;
}

export interface RequestAssetUploadParams extends ProjectIdentifier {
  size: number;
}

export interface RequestAssetUploadResponse {
  uploadId: string;
  uploadUrl: string;
}

export interface RequestMultipartAssetUploadParams extends ProjectIdentifier {
  archiveType: DeploymentArchiveType;
}

export interface RequestMultipartAssetUploadResponse {
  uploadId: string;
  awsUploadId: string;
  uploadPartUrls: string[];
  uploadChunkSize: number;
}

export interface RequestUploadPartParams extends ProjectIdentifier {
  uploadId: string;
  awsUploadId: string;
  size: number;
  partNumber: number;
  archiveType: DeploymentArchiveType;
}

export interface RequestUploadPartResponse {
  uploadPartUrl: string;
}

export interface MultiPartUploadInfo {
  awsUploadId: string;
  eTags: string[];
}

export interface RequestGitDiffUploadParams extends ProjectIdentifier {
  uploadId: string;
  size: number;
}

export interface RequestGitDiffUploadResponse {
  uploadUrl: string;
}

export interface CompleteAssetUploadParams extends ProjectIdentifier {
  uploadId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  rewrites: AssetUploadMetadata["rewrites"];
  mustHaveBase: boolean;
  createDeployment?: boolean;
  multipartUploadInfo?: MultiPartUploadInfo;
}

export interface ChunkPathOverlap {
  path: string;
  lowerChunk: { name: string; versionId: string };
  upperChunk: { name: string; versionId: string };
}

export interface CompleteAssetUploadResponse {
  testRun?: TestRun;
  baseNotFound?: boolean;
  /**
   * When set alongside `baseNotFound`, the server is asking the client to
   * extend its default base-polling window by this many milliseconds.
   */
  extraBasePollTimeoutMs?: number;
  message?: string;
  overlaps?: ChunkPathOverlap[];
  overlapsTruncated?: boolean;
}

export interface CompleteContainerUploadParams extends ProjectIdentifier {
  uploadId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  mustHaveBase: boolean;
  isUserVisible?: boolean;
  skipPreprocessing?: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  companionAssetsInfo?: CompanionAssetsInfo | undefined;
}

export interface CompleteContainerUploadResponse {
  testRun?: TestRun;
  message?: string;
  baseNotFound?: boolean;
  /**
   * When set alongside `baseNotFound`, the server is asking the client to
   * extend its default base-polling window by this many milliseconds.
   */
  extraBasePollTimeoutMs?: number;
}

export interface GetContainerDeploymentResponse {
  digest: string;
  size: number;
  pushedAt: string;
  containerPort?: number;
  containerEnv?: ContainerEnvVariable[];
  containerHealthCheckEndpoint?: string;
}

export interface ContainerEnvVariable {
  name: string;
  value: string;
}

/**
 * Builds a `RequestConfig` that puts `projectId` (if present) into the query
 * string. Every project-deployment endpoint reads `projectId` from
 * `@Query("projectId")` on the backend, not from the body.
 */
export const projectIdQuery = (
  projectId: string | undefined,
): { params: { projectId: string } } | undefined =>
  projectId ? { params: { projectId } } : undefined;

/**
 * Identifies (or overrides) a project for OAuth callers of the `agent/*`
 * namespace. Unlike {@link ProjectIdentifier}, `project` is resolved flexibly
 * server-side — a bare id, an `"organization/name"` slug, or a bare name that
 * uniquely identifies one of the caller's accessible projects (see
 * `ProjectService.resolveForUserByIdentifier`) — and falls back to the
 * caller's stored default project when omitted, so it's rarely needed.
 * Omitted entirely when authenticating with a project-scoped API token (the
 * token already pins the project).
 */
export interface AgentProjectOverride {
  project?: string | undefined;
  /**
   * These methods used to accept `projectId`; it's now `project` (resolved
   * flexibly server-side). Typed as `never` so TypeScript callers passing the
   * old field get a compile error rather than silently falling back to the
   * default project; JS callers are caught at runtime by `rejectLegacyProjectId`.
   */
  projectId?: never;
}

/**
 * Fails loudly if a caller passes the removed `projectId` field. Silently
 * ignoring it would fall back to the stored default project — potentially the
 * wrong project — which is exactly the surprise we want to avoid.
 */
const rejectLegacyProjectId = (body: object): void => {
  if ("projectId" in body) {
    throw new Error(
      "`projectId` is not supported by the agent SDK methods — pass `project` " +
        "instead (a project id, `organization/name` slug, or unique project " +
        "name), or omit it to use your default project.",
    );
  }
};

/**
 * Builds a `RequestConfig` that puts `project` (if present) into the query
 * string. Every `agent/*` endpoint reads it from `@Query("project")` on the
 * backend, not from the body.
 */
const projectQuery = (
  project: string | undefined,
): { params: { project: string } } | undefined =>
  project ? { params: { project } } : undefined;

export const requestAssetUpload = async ({
  client,
  projectId,
  ...body
}: RequestAssetUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestAssetUploadResponse }
  >(
    "project-deployments/request-asset-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestMultipartAssetUpload = async ({
  client,
  projectId,
  ...body
}: RequestMultipartAssetUploadParams & {
  client: MeticulousClient;
}): Promise<RequestMultipartAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestMultipartAssetUploadResponse }
  >(
    "project-deployments/request-multipart-asset-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestUploadPart = async ({
  client,
  projectId,
  ...body
}: RequestUploadPartParams & {
  client: MeticulousClient;
}): Promise<RequestUploadPartResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestUploadPartResponse }
  >("project-deployments/request-upload-part", body, projectIdQuery(projectId));
  return data;
};

export const requestGitDiffUpload = async ({
  client,
  projectId,
  ...body
}: RequestGitDiffUploadParams & {
  client: MeticulousClient;
}): Promise<RequestGitDiffUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestGitDiffUploadResponse }
  >(
    "project-deployments/request-git-diff-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const triggerRunOnDeployment = async ({
  client,
  projectId,
  ...body
}: CompleteAssetUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetUploadResponse }
  >("project-deployments/trigger-run", body, projectIdQuery(projectId));
  return data;
};

export const completeAssetUpload = async ({
  client,
  projectId,
  ...body
}: CompleteAssetUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetUploadResponse }
  >(
    "project-deployments/complete-asset-upload-and-maybe-trigger-run",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const completeContainerUpload = async ({
  client,
  projectId,
  ...body
}: CompleteContainerUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteContainerUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteContainerUploadResponse }
  >(
    "project-deployments/complete-container-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export type AssetChunkUploadPreviousStatus =
  | "pending_upload"
  | "uploaded"
  | "deleted"
  | "failed_uploading";

export interface RequestAssetChunkUploadParams extends ProjectIdentifier {
  chunkName: string;
  chunkVersionId: string;
  tarballSize: number;
  commitSha?: string | undefined;
  force?: boolean;
}

export type RequestAssetChunkUploadResponse =
  | { alreadyUploaded: true }
  | {
      alreadyUploaded: false;
      tarballUploadUrl: string;
      filesIndexUploadUrl: string;
      previousStatus: AssetChunkUploadPreviousStatus | null;
    };

export interface CompleteAssetChunkUploadParams extends ProjectIdentifier {
  chunkName: string;
  chunkVersionId: string;
  commitSha?: string | undefined;
}

export interface CompleteAssetChunkUploadResponse {
  message: string;
}

export interface ProjectAssetChunkReference {
  name: string;
  versionId: string;
}

export type ProjectAssetChunkVersionLookup = "latest-in-history";

/**
 * A chunk reference as *requested* on the trigger path: either an already
 * concrete {@link ProjectAssetChunkReference}, or a `versionLookup` the server
 * resolves to a concrete version before storing.
 */
export type RequestedProjectAssetChunkReference =
  | ProjectAssetChunkReference
  | {
      name: string;
      versionLookup: ProjectAssetChunkVersionLookup;
    };

export interface CreateRunWithUploadedAssetChunksParams extends ProjectIdentifier {
  commitSha: string;
  isUserVisible?: boolean;
  createDeployment?: boolean;
  assetReferencesManifest: RequestedProjectAssetChunkReference[];
  rewrites?: AssetUploadMetadata["rewrites"];
}

export interface CreateRunWithUploadedAssetChunksResponse {
  /**
   * The server-generated deployment id. Absent when `createDeployment` is false
   * (dry-run that only computes chunk path overlaps and creates nothing). Used
   * to key the git-diff S3 upload and passed back to
   * `triggerRunWithUploadedAssetChunks`.
   */
  sourceDeploymentId?: string;
  overlaps?: ChunkPathOverlap[];
  overlapsTruncated?: boolean;
}

export interface TriggerRunWithUploadedAssetChunksParams extends ProjectIdentifier {
  sourceDeploymentId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  mustHaveBase: boolean;
  isUserVisible?: boolean;
  skipPreprocessing?: boolean;
  /**
   * When set, the run only replays the sessions matching the filter (applied
   * to both the head run and any base run created to compare against).
   */
  sessionFilter?: SessionFilter | undefined;
}

export const createRunWithUploadedAssetChunks = async ({
  client,
  projectId,
  ...body
}: CreateRunWithUploadedAssetChunksParams & {
  client: MeticulousClient;
}): Promise<CreateRunWithUploadedAssetChunksResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CreateRunWithUploadedAssetChunksResponse }
  >(
    "project-deployments/create-run-with-uploaded-asset-chunks",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const triggerRunWithUploadedAssetChunks = async ({
  client,
  projectId,
  ...body
}: TriggerRunWithUploadedAssetChunksParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetUploadResponse }
  >(
    "project-deployments/trigger-run-with-uploaded-asset-chunks",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestAssetChunkUpload = async ({
  client,
  projectId,
  ...body
}: RequestAssetChunkUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAssetChunkUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestAssetChunkUploadResponse }
  >(
    "project-deployments/request-asset-chunk-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const completeAssetChunkUpload = async ({
  client,
  projectId,
  ...body
}: CompleteAssetChunkUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetChunkUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetChunkUploadResponse }
  >(
    "project-deployments/complete-asset-chunk-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const downloadProjectDeployment = async ({
  client,
  deploymentUploadId,
}: {
  client: MeticulousClient;
  deploymentUploadId: string;
}): Promise<DownloadDeploymentResponse> => {
  const { data } = await client.get<
    unknown,
    { data: DownloadDeploymentResponse }
  >(`project-deployments/${deploymentUploadId}`);
  return data;
};

export const getContainerDeployment = async ({
  client,
  deploymentUploadId,
}: {
  client: MeticulousClient;
  deploymentUploadId: string;
}): Promise<GetContainerDeploymentResponse> => {
  const { data } = await client.get<
    unknown,
    { data: GetContainerDeploymentResponse }
  >(`project-deployments/container/${deploymentUploadId}`);
  return data;
};

// ===========================================================================
// Agent namespace: split "upload a build" from "trigger a test run".
// `uploadBuild` registers a reusable deployment without triggering; the
// returned `deploymentId` is then passed to `triggerTestRun`.
// ===========================================================================

export type ProjectDeploymentSource = "assetUpload" | "containerUpload";

export interface AgentUploadBuildResponse {
  deploymentId: string;
}

export interface AgentUploadAssetBuildParams extends AgentProjectOverride {
  uploadId: string;
  commitSha: string;
  rewrites: AssetUploadMetadata["rewrites"];
  multipartUploadInfo?: MultiPartUploadInfo;
  archiveType: DeploymentArchiveType;
}

export const agentUploadAssetBuild = async ({
  client,
  project,
  ...body
}: AgentUploadAssetBuildParams & {
  client: MeticulousClient;
}): Promise<AgentUploadBuildResponse> => {
  rejectLegacyProjectId(body);
  const { data } = await client.post<
    typeof body,
    { data: AgentUploadBuildResponse }
  >("agent/upload-build/asset", body, projectQuery(project));
  return data;
};

export interface AgentUploadContainerBuildParams extends AgentProjectOverride {
  uploadId: string;
  commitSha: string;
  containerPort?: number;
  containerEnv?: ContainerEnvVariable[];
  containerHealthCheckEndpoint?: string;
}

export const agentUploadContainerBuild = async ({
  client,
  project,
  ...body
}: AgentUploadContainerBuildParams & {
  client: MeticulousClient;
}): Promise<AgentUploadBuildResponse> => {
  rejectLegacyProjectId(body);
  const { data } = await client.post<
    typeof body,
    { data: AgentUploadBuildResponse }
  >("agent/upload-build/container", body, projectQuery(project));
  return data;
};

export interface AgentUploadGitDiffBuildParams extends AgentProjectOverride {
  /**
   * The deployment to attach the diff to, as returned by `uploadBuild`.
   * Exactly one of `deploymentId` or `commitSha` must be provided.
   */
  deploymentId?: string;
  /**
   * Alternative to `deploymentId`: resolves to the most recent non-ephemeral
   * deployment already uploaded for this commit in the project.
   */
  commitSha?: string;
  /**
   * The base the diff is against. Namespaces the diff's S3 object so re-triggers
   * of the same deployment against different bases don't clobber each other.
   * Must match the `baseSha` later passed to `agentTriggerTestRun`.
   */
  baseSha: string;
  size: number;
}

export interface AgentUploadGitDiffBuildResponse extends RequestGitDiffUploadResponse {
  /**
   * The deployment the diff was attached to — the resolved id when the
   * request identified the deployment via `commitSha`. Callers should pin the
   * subsequent `agentTriggerTestRun` call to this id rather than re-passing
   * `commitSha`, so both requests target the same deployment row.
   */
  deploymentId: string;
}

export const agentUploadGitDiffBuild = async ({
  client,
  project,
  ...body
}: AgentUploadGitDiffBuildParams & {
  client: MeticulousClient;
}): Promise<AgentUploadGitDiffBuildResponse> => {
  rejectLegacyProjectId(body);
  const { data } = await client.post<
    typeof body,
    { data: AgentUploadGitDiffBuildResponse }
  >("agent/upload-build/git-diff", body, projectQuery(project));
  return data;
};

export interface AgentTriggerTestRunParams extends AgentProjectOverride {
  /**
   * The deployment to run, as returned by `uploadBuild`. Exactly one of
   * `deploymentId` or `commitSha` must be provided.
   */
  deploymentId?: string;
  /**
   * Alternative to `deploymentId`: resolves to the most recent non-ephemeral
   * deployment already uploaded for this commit in the project.
   */
  commitSha?: string;
  /** Required: an agent (custom-trigger) run is only useful with a base. */
  baseSha: string;
  /**
   * Optional explicit set of sessions to replay. When provided, the run replays
   * exactly these sessions (for both head and base) instead of the project's
   * auto-selected golden set.
   */
  sessionIds?: string[];
  /**
   * Caps each session replay at this many seconds; sessions longer than the
   * cap are trimmed. Only applied when `sessionIds` is also set — the backend
   * rejects it otherwise. Intended for newly custom-recorded sessions: the cap
   * is applied to both the head run and any fresh base run created to compare
   * against, but a pre-existing base run reused for the comparison keeps
   * whatever cap it originally ran under. Defaults to 300 seconds (5 minutes)
   * when omitted; pass `null` for unlimited. Wins over any project-configured
   * cap.
   */
  maxDurationSeconds?: number | null;
}

export interface AgentTriggerTestRunResponse {
  testRun?: TestRun;
  /** The head commit the run executed against (the deployment's commit). */
  commitSha?: string;
}

export const agentTriggerTestRun = async ({
  client,
  project,
  ...body
}: AgentTriggerTestRunParams & {
  client: MeticulousClient;
}): Promise<AgentTriggerTestRunResponse> => {
  rejectLegacyProjectId(body);
  const { data } = await client.post<
    typeof body,
    { data: AgentTriggerTestRunResponse }
  >("agent/trigger-test-run", body, projectQuery(project));
  return data;
};
