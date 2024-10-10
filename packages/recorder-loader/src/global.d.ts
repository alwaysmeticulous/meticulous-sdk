import type {
  RecordState,
  MeticulousWindowConfig,
  MeticulousPublicApi,
} from "@alwaysmeticulous/sdk-bundles-api";

declare global {
  interface Window extends MeticulousWindowConfig {
    __meticulous?: RecordState;
    Meticulous?: MeticulousPublicApi;
  }
}

export {};
