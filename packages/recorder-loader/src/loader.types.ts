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
}

/**
 * Options for loading the Meticulous recorder.
 *
 * The `integrity` parameter can only be provided when `version` is also specified,
 * enabling Subresource Integrity (SRI) verification for the loaded script.
 */
export type LoaderOptions = BaseLoaderOptions &
  (
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
         * Optional integrity hash for subresource integrity (SRI) verification of the loaded snippet.
         * This ensures the loaded script matches the expected hash.
         *
         * Example: "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
         */
        integrity?: string;
      }
    | {
        version?: undefined;
        integrity?: undefined;
      }
  );
