import { maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export interface GetIsLockedOptions {
  client: MeticulousClient;
  deploymentId: string;
}

export const getIsLocked = async ({
  client,
  deploymentId,
}: GetIsLockedOptions): Promise<boolean> => {
  const { data } = await client
    .get<unknown, { data: string }>("deployment-locks/is-locked", {
      params: { deploymentId },
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data === "true";
};
