import { AxiosInstance } from "axios";
import { maybeEnrichAxiosError } from "../errors";

export interface GetIsLockedOptions {
  client: AxiosInstance;
  deploymentId: string;
}

export const getIsLocked = async ({
  client,
  deploymentId,
}: GetIsLockedOptions): Promise<boolean> => {
  const { data } = await client
    .get<unknown, { data: boolean }>("deployment-locks/is-locked", {
      params: { deploymentId },
    })
    .catch((error) => {
      throw maybeEnrichAxiosError(error);
    });

  return data;
};
