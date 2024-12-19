import type {
  MeticulousWindowConfig,
  MeticulousPublicApi,
} from "@alwaysmeticulous/sdk-bundles-api";

declare global {
  interface Window extends MeticulousWindowConfig {
    Meticulous?: MeticulousPublicApi;
  }
}

export {};
