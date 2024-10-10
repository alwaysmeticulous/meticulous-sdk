import {
  NetworkResponseSanitizer,
  RecorderMiddleware,
} from "@alwaysmeticulous/sdk-bundles-api";

export interface LoaderOptions {
  /**
   * @deprecated Renamed to recordingToken. Please use the same value but pass it as the recordingToken instead.
   */
  projectId?: string;
  recordingToken: string;

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
   *
   * @deprecated Please use `middleware` instead.
   */
  responseSanitizers?: NetworkResponseSanitizer[];

  /**
   * Transform the recorded data before it is sent to Meticulous's servers. This is useful for redacting sensitive
   * information when recording production sessions.
   *
   * Please see JSDoc on {@link RecorderMiddleware} before implementing custom middleware.
   */
  middleware?: RecorderMiddleware[];
}
