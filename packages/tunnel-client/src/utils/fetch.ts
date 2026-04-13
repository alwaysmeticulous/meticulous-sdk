import { createMeticulousFetch } from "@alwaysmeticulous/common";
import type nodeFetch from "node-fetch";
import { getProxyAgent } from "./get-proxy-agent";

type FetchImplementation = typeof nodeFetch;

export const meticulousFetch = createMeticulousFetch({
  createFallbackInit,
  getFallbackFetch,
});

function createFallbackInit(init?: Parameters<FetchImplementation>[1]) {
  return {
    ...init,
    agent: getProxyAgent(),
  };
}

function getFallbackFetch(): FetchImplementation {
  const nodeFetchModule = require("node-fetch") as typeof import("node-fetch");

  return (nodeFetchModule.default ?? nodeFetchModule) as FetchImplementation;
}
