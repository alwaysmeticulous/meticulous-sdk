import {
  NetworkResponseSanitizer,
  RecorderMiddleware,
} from "@alwaysmeticulous/sdk-bundles-api";

interface BaseLoaderOptions {
  /**
   * @deprecated Renamed to recordingToken. Please use the same value but pass it as the recordingToken instead.
   */
  projectId?: string;
  recordingToken: string;

  uploadIntervalMs?: number;
  snapshotLinkedStylesheets?: boolean;
  commitHash?: string;

  /**
   * If it takes more than the specified number of 'ms' to load the recorder,
   * then the promise returned by tryLoadAndStartRecorder will return
   * immediately (thereby unblocking the load of the application, but preventing
   * Meticulous from recording a correct session, with all required network mocks).
   *
   * Defaults to 2000ms.
   */
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

  /**
   * If set, we will use this nonce attribute on the script tag we create.
   */
  nonce?: string;

  /**
   * If set, this will disable reporting of errors to Meticulous. This is useful if you can't allow the script
   * to communicate out to Sentry.
   */
  disableErrorReporting?: boolean;

  /**
   * If set, this will disable a tracker ID that is used to link developer's sessions to their Meticulous account.
   * This is particularly useful if you can't allow the script to create an iframe to meticulous.ai to track the session.
   */
  disableTrackerId?: boolean;
}

/**
 * Options for loading a specific version of the Meticulous recorder.
 * The `integrity` parameter can only be provided when `version` is also specified.
 */
type VersioningLoaderOptions =
  | {
      /**
       * Load a specific fixed version of the snippet. If not set will load the
       * latest minor/patch version of the recorder. Bumping to a new major
       * version requires a bump of your @alwaysmeticulous/recorder-loader
       * dependency.
       *
       * Recommendation: leave this unset
       */
      version: string;

      /**
       * If set, we will use this integrity attribute on the script tag we create. This is useful if you have
       * pinned the version above, and additionally want to ensure that the snippet is not corrupted.
       */
      integrity?: string;
    }
  | {
      version?: undefined;
      integrity?: undefined;
    };

/**
 * Options for loading the Meticulous recorder.
 */
export type LoaderOptions = BaseLoaderOptions & VersioningLoaderOptions;
