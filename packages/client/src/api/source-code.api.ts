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
