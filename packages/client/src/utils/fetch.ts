import { createMeticulousFetch } from "@alwaysmeticulous/common";
import type nodeFetch from "node-fetch";
import { getProxyAgent } from "./get-proxy-agent";

type FetchImplementation = typeof nodeFetch;

export const meticulousFetch = createMeticulousFetch<
  Parameters<FetchImplementation>[0],
  Parameters<FetchImplementation>[1],
  Awaited<ReturnType<FetchImplementation>>
>({
  createFallbackInit,
  getFallbackFetch,
});

function createFallbackInit(
  init?: Parameters<FetchImplementation>[1],
): Parameters<FetchImplementation>[1] {
  return {
    ...init,
    agent: getProxyAgent(),
  };
}

async function getFallbackFetch() {
  const nodeFetchModule = await import("node-fetch");

  return (nodeFetchModule.default ?? nodeFetchModule) as FetchImplementation;
}
