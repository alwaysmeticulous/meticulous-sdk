import type { RecordState } from "@alwaysmeticulous/sdk-bundles-api";
import { MeticulousWindowConfig } from "@alwaysmeticulous/sdk-bundles-api";

declare global {
  interface Window extends MeticulousWindowConfig {
    __meticulous?: RecordState;
  }
}

export {};
