import { MeticulousClient } from "../types/client.types";

export interface WhoamiResponse {
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  organizations: { name: string; id: string }[];
}

export const getWhoami = async (
  client: MeticulousClient,
): Promise<WhoamiResponse> => {
  const { data } = await client.get<WhoamiResponse>("oauth/whoami");
  return data;
};
