import type nodeFetch from "node-fetch";
import { getProxyAgent } from "./get-proxy-agent";

type FetchImplementation = typeof nodeFetch;

const PROXY_ENVIRONMENT_VARIABLES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;

const hasProxyConfiguration = () => {
  return PROXY_ENVIRONMENT_VARIABLES.some((environmentVariable) => {
    return Boolean(process.env[environmentVariable]);
  });
};

const getNodeFetch = (): FetchImplementation => {
  const nodeFetchModule = require("node-fetch") as typeof import("node-fetch");

  return (nodeFetchModule.default ?? nodeFetchModule) as FetchImplementation;
};

export const meticulousFetch = (
  input: Parameters<FetchImplementation>[0],
  init?: Parameters<FetchImplementation>[1],
) => {
  if (!hasProxyConfiguration() && typeof globalThis.fetch === "function") {
    return globalThis.fetch(
      input as Parameters<typeof globalThis.fetch>[0],
      init as Parameters<typeof globalThis.fetch>[1],
    );
  }

  return getNodeFetch()(input, {
    ...init,
    agent: getProxyAgent(),
  });
};
