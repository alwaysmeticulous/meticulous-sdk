import type { TestRun } from "@alwaysmeticulous/api";
import type { MeticulousClient } from "../types/client.types";
import type { ProjectIdentifier } from "./project-deployments.api";

export interface GetRegistryAuthParams extends ProjectIdentifier {
  commitSha?: string | undefined;
  deduplicateCommitUpload?: boolean | undefined;
}

export interface GetRegistryAuthResponse {
  registryUrl: string;
  projectName: string;
  robotAccountName: string;
  robotAccountSecret: string;
  expiresAt: string;
  uploadId: string;
  imageReference: string;
  alreadyUploaded?: boolean;
  testRun?: TestRun;
  message?: string;
}

export const getRegistryAuth = async ({
  client,
  projectId,
  commitSha,
  deduplicateCommitUpload,
}: GetRegistryAuthParams & {
  client: MeticulousClient;
}): Promise<GetRegistryAuthResponse> => {
  const params = {
    ...(projectId ? { projectId } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(deduplicateCommitUpload ? { deduplicateCommitUpload: true } : {}),
  };
  const { data } = await client.get<GetRegistryAuthResponse>(
    "registry/auth",
    Object.keys(params).length > 0 ? { params } : undefined,
  );
  return data;
};
