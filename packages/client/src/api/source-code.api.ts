import { MeticulousClient } from "../types/client.types";

export const getPrDiff = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<{ content: string }> => {
  const { data } = await client.post<unknown, { data: { content: string } }>(
    "/source-code/pr-diff",
    { testRunId },
  );
  return data;
};

export const getPrDiffForTestRun = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<{ content: string }> => {
  const { data } = await client.get<unknown, { data: { content: string } }>(
    `/test-runs/${testRunId}/pr-diff`,
  );
  return data;
};

export const getPrDescription = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<{ content: string }> => {
  const { data } = await client.post<unknown, { data: { content: string } }>(
    "/source-code/pr-description",
    { testRunId },
  );
  return data;
};

export const getPrDescriptionForTestRun = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<{ content: string }> => {
  const { data } = await client.get<unknown, { data: { content: string } }>(
    `/test-runs/${testRunId}/pr-description`,
  );
  return data;
};
