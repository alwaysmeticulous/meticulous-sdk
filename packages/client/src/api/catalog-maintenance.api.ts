import type { MeticulousClient } from "../types/client.types";
import { projectIdQuery } from "./project-deployments.api";

/**
 * Endpoints used by the per-project session-mutation catalog-maintenance
 * worker. The worker holds no S3 credentials; it asks the backend for a
 * short-lived presigned PUT at upload time.
 */

export interface RequestCatalogMaintenanceProposalUploadParams {
  projectId?: string;
  /** The maintenance run this proposal belongs to. */
  runId: string;
  /** Exact upload size; the presigned PUT is pinned to it. */
  sizeBytes: number;
}

export interface RequestCatalogMaintenanceProposalUploadResponse {
  uploadUrl: string;
}

export interface LaunchCatalogMaintenanceParams {
  projectId?: string;
  runId: string;
}

export interface LaunchCatalogMaintenanceResponse {
  workflowName: string;
}

/** Launch the per-project maintenance worker (called by the trusted scheduler). */
export const launchCatalogMaintenance = async ({
  client,
  projectId,
  ...body
}: LaunchCatalogMaintenanceParams & {
  client: MeticulousClient;
}): Promise<LaunchCatalogMaintenanceResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: LaunchCatalogMaintenanceResponse }
  >("catalog-maintenance/launch", body, projectIdQuery(projectId));
  return data;
};

export interface GetCatalogMaintenanceWorkflowStatusParams {
  projectId?: string;
  workflowName: string;
}

export interface CatalogMaintenanceWorkflowStatusResponse {
  /** Argo workflow phase (`Running`, `Succeeded`, `Failed`, ...) or `NotFound`. */
  phase: string;
}

export const getCatalogMaintenanceWorkflowStatus = async ({
  client,
  projectId,
  workflowName,
}: GetCatalogMaintenanceWorkflowStatusParams & {
  client: MeticulousClient;
}): Promise<CatalogMaintenanceWorkflowStatusResponse> => {
  const { data } = await client.get<
    unknown,
    { data: CatalogMaintenanceWorkflowStatusResponse }
  >("catalog-maintenance/status", {
    params: {
      workflowName,
      ...(projectId ? { projectId } : {}),
    },
  });
  return data;
};

export const requestCatalogMaintenanceProposalUpload = async ({
  client,
  projectId,
  ...body
}: RequestCatalogMaintenanceProposalUploadParams & {
  client: MeticulousClient;
}): Promise<RequestCatalogMaintenanceProposalUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestCatalogMaintenanceProposalUploadResponse }
  >(
    "catalog-maintenance/request-proposal-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};
