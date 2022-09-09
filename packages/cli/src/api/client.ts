import axios, { AxiosInstance } from "axios";
import { getApiToken } from "../utils/api-token.utils";

// const BASE_API_URL = "https://app.meticulous.ai/api/";
const BASE_API_URL = "http://localhost:3000/api/";

export interface ClientOptions {
  apiToken: string | null | undefined;
}

export const createClient: (options: ClientOptions) => AxiosInstance = ({
  apiToken: apiToken_,
}) => {
  const apiToken = getApiToken(apiToken_);
  return axios.create({
    baseURL: BASE_API_URL,
    headers: {
      authorization: apiToken,
    },
  });
};
