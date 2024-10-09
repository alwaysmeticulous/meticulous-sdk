// Settings sent from the recorder-loader to the recorder bundle

import { NetworkResponseMetadata, RecorderMiddleware } from "./middleware";

export interface MeticulousWindowConfig {
  METICULOUS_RECORDING_TOKEN?: string;
  METICULOUS_UPLOAD_INTERVAL_MS?: number;
  METICULOUS_APP_COMMIT_HASH?: string;
  METICULOUS_SNAPSHOT_LINKED_STYLESHEETS?: boolean;
  METICULOUS_FORCE_RECORDING?: boolean;
  METICULOUS_IS_PRODUCTION_ENVIRONMENT?: boolean;
  METICULOUS_NETWORK_RESPONSE_SANITIZERS?: NetworkResponseSanitizer[];
  METICULOUS_RECORDER_MIDDLEWARE_V1: RecorderMiddleware[];
}

/**
 * Allows sanitizing network responses before they are sent to Meticulous's servers.
 */
export interface NetworkResponseSanitizer {
  /**
   * The sanitizeBody function will only be applied to responses for request URLs that match this regex.
   */
  urlRegex: RegExp;

  /**
   * Returns a new sanitized version of the response body. Please ensure this function is fast to run,
   * and handles errors gracefully, since it'll be applied to all responses for requests with urls that match
   * the urlRegex.
   *
   * Please note that the sanitized responses should be designed such that the app can still correctly function
   * at replay time. For example, if you want to sanitize email addresses, replace them with a dummy email address
   * of a current format. That will ensure that the email address will still pass any validation the application may have.
   */
  sanitizeBody: (body: string, metadata: NetworkResponseMetadata) => string;
}
