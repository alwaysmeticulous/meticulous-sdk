import type { MeticulousClient } from "../types/client.types";
import type {
  AcquireAgenticRepoLeaseParams,
  AcquireAgenticRepoLeaseResponse,
  AgenticRepoLeaseRef,
  AgenticRepoLeaseStatusResponse,
  GetAgenticRepoFileParams,
  GetAgenticRepoFileResponse,
  GetAgenticRepoLeaseStatusParams,
  HeartbeatAgenticRepoLeaseParams,
  HeartbeatAgenticRepoLeaseResponse,
  ListAgenticRepoTreeParams,
  ListAgenticRepoTreeResponse,
  ReleaseAgenticRepoLeaseParams,
  ReleaseAgenticRepoLeaseResponse,
  SearchAgenticRepoCodeParams,
  SearchAgenticRepoCodeResponse,
} from "./agentic-session-generation.api";
import {
  projectIdQuery,
  type ProjectIdentifier,
} from "./project-deployments.api";

export interface GetDiscoveryRepoFilesParams
  extends ProjectIdentifier, AgenticRepoLeaseRef {
  commitSha: string;
  paths: string[];
  /** Per-file truncation cap. Repo-server clamps to 5 MiB. */
  maxBytesPerFile?: number;
  /** Aggregate encoded-payload cap. Repo-server clamps to 25 MiB. */
  maxTotalBytes?: number;
}

export interface DiscoveryRepoFileEntry {
  path: string;
  kind: "found" | "missing" | "skipped";
  /** UTF-8 decoded file contents; present only when `kind === "found"`. */
  content?: string;
  /** `true` when the selected content exceeded the per-file byte cap. */
  truncated?: boolean;
  /** Total blob size in bytes before any truncation. */
  sizeBytes?: number;
}

export interface GetDiscoveryRepoFilesResponse {
  files: DiscoveryRepoFileEntry[];
  /** `true` when trailing paths were skipped because the aggregate byte cap tripped. */
  totalBytesCapReached: boolean;
}

/** Maximum paths accepted by {@link getDiscoveryRepoFiles} in one request. */
export const MAX_DISCOVERY_REPO_FILES_PATHS = 500;

/**
 * Repo-server source access for the weekly session-mutation
 * catalog-maintenance job. Same request/response shapes as the agentic
 * session-generation repo surface (the backend delegates to the same
 * service) but served under `session-transform-discovery/*`, which is gated
 * on the project being monitored, paying, or in pilot instead of the
 * agentic feature flag.
 */

export const getDiscoveryRepoFile = async ({
  client,
  projectId,
  ...body
}: GetAgenticRepoFileParams & {
  client: MeticulousClient;
}): Promise<GetAgenticRepoFileResponse> => {
  const { data } = await client.post<GetAgenticRepoFileResponse>(
    "session-transform-discovery/repo/file",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const getDiscoveryRepoFiles = async ({
  client,
  projectId,
  ...body
}: GetDiscoveryRepoFilesParams & {
  client: MeticulousClient;
}): Promise<GetDiscoveryRepoFilesResponse> => {
  const { data } = await client.post<GetDiscoveryRepoFilesResponse>(
    "session-transform-discovery/repo/files",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const searchDiscoveryRepoCode = async ({
  client,
  projectId,
  ...body
}: SearchAgenticRepoCodeParams & {
  client: MeticulousClient;
}): Promise<SearchAgenticRepoCodeResponse> => {
  const { data } = await client.post<SearchAgenticRepoCodeResponse>(
    "session-transform-discovery/repo/search",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const listDiscoveryRepoTree = async ({
  client,
  projectId,
  ...body
}: ListAgenticRepoTreeParams & {
  client: MeticulousClient;
}): Promise<ListAgenticRepoTreeResponse> => {
  const { data } = await client.post<ListAgenticRepoTreeResponse>(
    "session-transform-discovery/repo/ls-tree",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const acquireDiscoveryRepoLease = async ({
  client,
  projectId,
  ...body
}: AcquireAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<AcquireAgenticRepoLeaseResponse> => {
  const { data } = await client.post<AcquireAgenticRepoLeaseResponse>(
    "session-transform-discovery/repo/lease/acquire",
    body,
    {
      ...projectIdQuery(projectId),
      // The acquire endpoint blocks server-side up to ~6 min bringing a cold
      // pod up; wait that out in a single attempt (matches the agentic client).
      timeout: 6.5 * 60 * 1000,
    },
  );
  return data;
};

export const getDiscoveryRepoLeaseStatus = async ({
  client,
  projectId,
  podInstanceId,
}: GetAgenticRepoLeaseStatusParams & {
  client: MeticulousClient;
}): Promise<AgenticRepoLeaseStatusResponse> => {
  const { data } = await client.get<AgenticRepoLeaseStatusResponse>(
    "session-transform-discovery/repo/lease/status",
    {
      params: {
        ...(projectId ? { projectId } : {}),
        ...(podInstanceId ? { podInstanceId } : {}),
      },
    },
  );
  return data;
};

export const heartbeatDiscoveryRepoLease = async ({
  client,
  projectId,
  ...body
}: HeartbeatAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<HeartbeatAgenticRepoLeaseResponse> => {
  const { data } = await client.post<HeartbeatAgenticRepoLeaseResponse>(
    "session-transform-discovery/repo/lease/heartbeat",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const releaseDiscoveryRepoLease = async ({
  client,
  projectId,
  ...body
}: ReleaseAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<ReleaseAgenticRepoLeaseResponse> => {
  const { data } = await client.post<ReleaseAgenticRepoLeaseResponse>(
    "session-transform-discovery/repo/lease/release",
    body,
    projectIdQuery(projectId),
  );
  return data;
};
