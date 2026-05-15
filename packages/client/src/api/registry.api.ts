import { MeticulousClient } from "../types/client.types";
import { ProjectIdentifier } from "./project-deployments.api";

export interface GetRegistryAuthResponse {
  registryUrl: string;
  projectName: string;
  robotAccountName: string;
  robotAccountSecret: string;
  expiresAt: string;
  uploadId: string;
  imageReference: string;
}

export const getRegistryAuth = async ({
  client,
  projectId,
}: ProjectIdentifier & {
  client: MeticulousClient;
}): Promise<GetRegistryAuthResponse> => {
  const { data } = await client.get<unknown, { data: GetRegistryAuthResponse }>(
    "registry/auth",
    projectId ? { params: { projectId } } : undefined,
  );
  return data;
};
