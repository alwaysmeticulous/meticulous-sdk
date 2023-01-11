import { NetworkResponseSanitizer } from "@alwaysmeticulous/sdk-bundles-api";

export interface LoaderOptions {
  projectId: string;
  uploadIntervalMs?: number;
  snapshotLinkedStylesheets?: boolean;
  commitHash?: string;

  maxMsToBlockFor?: number;
  snippetsBaseUrl?: string;

  /**
   * Optional. Allows sanitizing network responses before they are sent to Meticulous's servers.
   */
  responseSanitizers?: NetworkResponseSanitizer[];
}
