import type { MeticulousClient } from "../types/client.types";
import type {
  AcquireAgenticRepoLeaseParams,
  AcquireAgenticRepoLeaseResponse,
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
import { projectIdQuery } from "./project-deployments.api";

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
  const { data } = await client.post<
    typeof body,
    { data: GetAgenticRepoFileResponse }
  >("session-transform-discovery/repo/file", body, projectIdQuery(projectId));
  return data;
};

export const searchDiscoveryRepoCode = async ({
  client,
  projectId,
  ...body
}: SearchAgenticRepoCodeParams & {
  client: MeticulousClient;
}): Promise<SearchAgenticRepoCodeResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: SearchAgenticRepoCodeResponse }
  >("session-transform-discovery/repo/search", body, projectIdQuery(projectId));
  return data;
};

export const listDiscoveryRepoTree = async ({
  client,
  projectId,
  ...body
}: ListAgenticRepoTreeParams & {
  client: MeticulousClient;
}): Promise<ListAgenticRepoTreeResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: ListAgenticRepoTreeResponse }
  >(
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
  const { data } = await client.post<
    typeof body,
    { data: AcquireAgenticRepoLeaseResponse }
  >("session-transform-discovery/repo/lease/acquire", body, {
    ...projectIdQuery(projectId),
    // The acquire endpoint blocks server-side up to ~6 min bringing a cold
    // pod up; wait that out in a single attempt (matches the agentic client).
    timeout: 6.5 * 60 * 1000,
  });
  return data;
};

export const getDiscoveryRepoLeaseStatus = async ({
  client,
  projectId,
  podInstanceId,
}: GetAgenticRepoLeaseStatusParams & {
  client: MeticulousClient;
}): Promise<AgenticRepoLeaseStatusResponse> => {
  const { data } = await client.get<
    unknown,
    { data: AgenticRepoLeaseStatusResponse }
  >("session-transform-discovery/repo/lease/status", {
    params: {
      ...(projectId ? { projectId } : {}),
      ...(podInstanceId ? { podInstanceId } : {}),
    },
  });
  return data;
};

export const heartbeatDiscoveryRepoLease = async ({
  client,
  projectId,
  ...body
}: HeartbeatAgenticRepoLeaseParams & {
  client: MeticulousClient;
}): Promise<HeartbeatAgenticRepoLeaseResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: HeartbeatAgenticRepoLeaseResponse }
  >(
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
  const { data } = await client.post<
    typeof body,
    { data: ReleaseAgenticRepoLeaseResponse }
  >(
    "session-transform-discovery/repo/lease/release",
    body,
    projectIdQuery(projectId),
  );
  return data;
};
