import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import log from "loglevel";
import { getApiToken } from "./api-token.utils";
import { getProxyAgent } from "./utils/get-proxy-agent";

const BASE_API_URL = "https://app.meticulous.ai/api/";

export interface ClientOptions {
  apiToken: string | null | undefined;
}

export const createClient: (options: ClientOptions) => AxiosInstance = ({
  apiToken: apiToken_,
}) => {
  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    const logger = log.getLogger(METICULOUS_LOGGER_NAME);
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }
  const client = axios.create({
    baseURL: getApiUrl(),
    headers: {
      authorization: apiToken,
    },
    // 60 seconds default timeout
    timeout: 60_000,
    httpsAgent: getProxyAgent(),
  });
  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
  });

  return client;
};

const getApiUrl = () => {
  if (process.env["METICULOUS_API_URL"]) {
    return process.env["METICULOUS_API_URL"];
  }
  return BASE_API_URL;
};
