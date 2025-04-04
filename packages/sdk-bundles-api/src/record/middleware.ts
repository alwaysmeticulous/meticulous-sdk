import {
  Cookie,
  HarRequest,
  HarResponse,
  StorageEntry,
  WebSocketConnectionData,
} from "@alwaysmeticulous/api";

/**
 * Transformations that are applied to a recorder payload before it is sent to Meticulous's servers. This is
 * useful for redacting sensitive information from the payload before it is sent.
 *
 * Notes:
 *  - For each of these transforms returning `null` will cause that value to be dropped from the payload.
 *  - The sanitized responses should be designed such that the app can still correctly function at replay time.
 *    For example, if you want to sanitize email addresses, replace them with a dummy email address
 *    of a current format. That will ensure that the email address will still pass any validation the application may have.
 *  - Please ensure that these functions are fast to run, and handle errors gracefully, since they'll be applied to all
 *    data. Some of the data, such as network response bodies, may be very large.
 *  - Please do not mutate the objects. Instead return a new object with the desired changes.
 *  - New fields may be added to objects in future. This means that:
 *
 *      `transformLocalStorageEntry: ({ key, value }) => ({ key, value: "REDACTED" })`
 *
 *    Is unsafe. While:
 *
 *      `transformLocalStorageEntry: ({ value, ...rest }) => ({ ...rest, value: "REDACTED" })`
 *
 *    Is safe.
 */
export interface RecorderMiddleware {
  // Storage
  // -------

  /**
   * Transforms local storage entries before they are sent to Meticulous's servers.
   *
   * Returning null will cause the entry to be dropped from the payload.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformLocalStorageEntry?: (entry: StorageEntry) => StorageEntry | null;

  /**
   * Transforms session storage entries before they are sent to Meticulous's servers.
   *
   * Returning null will cause the entry to be dropped from the payload.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformSessionStorageEntry?: (entry: StorageEntry) => StorageEntry | null;

  /**
   * Transforms IndexedDB entries before they are sent to Meticulous's servers.
   *
   * Returning null will cause the entry to be dropped from the payload.
   *
   * Please note that the entries for a single database may be split across multiple payloads.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformIndexedDBEntries?: (
    entries: IndexedDBStoreEntries
  ) => IndexedDBStoreEntries | null;

  /**
   * Transforms cookies before they are sent to Meticulous's servers.
   *
   * Returning null will cause the cookie to be dropped from the payload.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformCookie?: (cookie: Cookie) => Cookie | null;

  // Network
  // -------

  /**
   * Transforms network requests before they are sent to Meticulous's servers.
   *
   * If you are only transforming headers, and nothing else then set {@link applyRequestTransformationAtReplayTime}
   * to false.
   *
   * If you are transforming URLs, query strings or request bodies, or sometimes returning null, then:
   *
   *  1. Please ensure you call tryLoadAndStartRecorder with your middleware, or set
   *     `window.METICULOUS_RECORDER_MIDDLEWARE_V1`, when Meticulous is replaying sessions at test time
   *     ('replay time'), and not just when you want to record. This allows Meticulous to auto-detect your
   *     middleware and transform the requests at replay time when finding an appropiate request to match
   *     with. This enables correctly matching requests with the corresponding saved responses even if the
   *     requests have been substantially transformed by your middleware.
   *
   *  2. Please avoid changing the transformations applied based on context that may differ at replay time.
   *     For example, if you change whether you apply transformNetworkRequest based on whether the current URL contains
   *     'staging', then when replaying the recorded session that network request transformer would not be applied
   *     (URL does not contain 'staging', even if the original session was recorded on a staging environment), and
   *     so the request may not be able to be matched correctly.
   *
   *  3. Enough unique information must still be preserved in the redacted network request to allow Meticulous
   *     to correctly match a request that is performed at replay time by your application with
   *     the correct corresponding saved request stored in the recording / recorded session.
   *
   *     For example: if you replace all query string values with "[REDACTED]", and there are multiple distinct
   *     requests with identical paths but different query string values then Meticulous will not have enough
   *     information to match them correctly. However if instead you md5 hash all query string values then
   *     Meticulous would have enough information to match the requests correctly.
   *
   *  4. Returning null will cause the request and the corresponding response to be dropped from the payload.
   *     At replay time if there is no exact match for a request that is transformed to null then the request
   *     will be failed with 'net::ERR_FAILED'/'Failed to fetch' rather than automatically trying to find a
   *     'closest match' in the recorded session.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformNetworkRequest?: (
    request: Omit<HarRequest, "queryString">,
    metadata: NetworkRequestMetadata
  ) => Omit<HarRequest, "queryString"> | null;

  /**
   * Transforms network responses before they are sent to Meticulous's servers.
   *
   * If you wish to drop a network response entirely please implement transformNetworkRequest
   * instead and return null for the corresponding request.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformNetworkResponse?: (
    response: HarResponse,
    metadata: NetworkResponseMetadata
  ) => HarResponse;

  /**
   * Transforms WebSocket messages before they are sent to Meticulous's servers.
   *
   * Returning null will cause the data to be dropped from the payload.
   *
   * Please note that the messages sent across a connection to a single URL may be split across multiple payloads.
   *
   * Note: we pass the WebSocketConnectionData to your middleware without the id field, and re-add the id field after
   * you return the transformed data.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformWebSocketConnectionData?: (
    entry: Omit<WebSocketConnectionData, "id">
  ) => Omit<WebSocketConnectionData, "id"> | null;

  /**
   * Defaults to true. Set to false if transformNetworkRequest only transforms the headers and not the URL or body of the request,
   * and transformNetworkRequest never returns null. Setting to false when not required improves replay performance.
   *
   * See {@link transformNetworkRequest} for more details.
   */
  applyRequestTransformationAtReplayTime?: boolean;
}

export interface IndexedDBStoreEntries {
  databaseName: string;
  objectStoreName: string;
  entries: {
    /**
     * Note if you don't set explicit keys, and instead use 'keyPath' when constructing your store then
     * the key passed here will be undefined: you'll need to retrieve your key from the value.
     */
    key?: IDBValidKey;

    /**
     * The value stored in IDB. For most IDB use cases this is normally a JSON string.
     */
    value: unknown;
  }[];
}

export interface NetworkRequestMetadata {
  /**
   * Milliseconds since unix epoch when the request was sent
   *
   * Note: this is only defined at record time, not when we redact the requests at replay time
   * for matching with the stored redacted requests in the original recording. See JSDoc on
   * {@link RecorderMiddleware.transformNetworkRequest} for more information.
   */
  requestStartedAt?: number;
}

export interface NetworkResponseMetadata extends NetworkResponseTimings {
  request: Omit<HarRequest, "queryString">;
}

export interface NetworkResponseTimings {
  /**
   * Milliseconds since unix epoch when the request was sent
   */
  requestStartedAt: number;

  /**
   * Milliseconds since unix epoch when the response was received
   */
  responseReceivedAt: number;
}
