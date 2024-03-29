import { NetworkResponseSanitizer } from "@alwaysmeticulous/sdk-bundles-api";

export interface LoaderOptions {
  projectId: string;
  uploadIntervalMs?: number;
  snapshotLinkedStylesheets?: boolean;
  commitHash?: string;

  maxMsToBlockFor?: number;
  snippetsBaseUrl?: string;

  isProduction?: boolean;

  /**
   * Optional. Disables abandonment due to payload size behaviour.
   *
   * The recorder will automatically abandon if it detects that the load on the network is too large.
   * This is a protection mechanism for production deployments to prevent any performance degradation.
   *
   * If you are recording local / staging sessions or seeing high abandon rate you may want to set this to true.
   *
   * @default false
   */
  forceRecording?: boolean;

  /**
   * Optional. Allows sanitizing network responses before they are sent to Meticulous's servers.
   */
  responseSanitizers?: NetworkResponseSanitizer[];
}
