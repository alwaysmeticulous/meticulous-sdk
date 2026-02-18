import { MeticulousClient } from "../types/client.types";

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
}: {
  client: MeticulousClient;
}): Promise<GetRegistryAuthResponse> => {
  const { data } = await client.get<unknown, { data: GetRegistryAuthResponse }>(
    "registry/auth"
  );
  return data;
};
