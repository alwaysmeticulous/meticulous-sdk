import { AxiosInstance, isAxiosError } from "axios";

export interface GetIsLockedOptions {
  client: AxiosInstance;
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
      if (isAxiosError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data.trim() === "true";
};
