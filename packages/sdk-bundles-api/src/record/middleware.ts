import {
  Cookie,
  HarRequest,
  HarResponse,
  IDBObjectStoreWithEntries,
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
   * Please note if redacting the network request enough unique information must be preserved to allow
   * Meticulous to correctly match a request that is performed at replay time by your application with
   * the correct corresponding saved request stored in the recording / recorded session.
   *
   * Returning null will cause the request and the corresponding response to be dropped from the payload.
   * If the request/response is dropped from the payload but at replay time your application still makes
   * the request then Meticulous will look for another closely matching recorded request, and replay that,
   * or if none can be found it will fail the request with 'net::ERR_FAILED'/'Failed to fetch'.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformNetworkRequest?: (
    request: HarRequest,
    metadata: NetworkRequestMetadata
  ) => HarRequest | null;

  /**
   * Transforms network requests before they are sent to Meticulous's servers.
   *
   * Returning null will cause the request and the response to be dropped from the payload.
   * If the request/response is dropped from the payload but at replay time your application still makes
   * the request then Meticulous will look for another closely matching recorded request, and replay that,
   * or if none can be found it will fail the request with 'net::ERR_FAILED'/'Failed to fetch'.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformNetworkResponse?: (
    response: HarResponse,
    metadata: NetworkResponseMetadata
  ) => HarResponse | null;

  /**
   * Transforms WebSocket messages before they are sent to Meticulous's servers.
   *
   * Returning null will cause the data to be dropped from the payload.
   *
   * Please note that the messages sent across a connection to a single URL may be split across multiple payloads.
   *
   * See JSDoc for {@link RecorderMiddleware} before implementing.
   */
  transformWebSocketConnectionData?: (
    entry: Omit<WebSocketConnectionData, "id">
  ) => Omit<WebSocketConnectionData, "id"> | null;
}

export interface IndexedDBStoreEntries {
  databaseName: string;
  objectStoreName: string;
  entries: IDBObjectStoreWithEntries["entries"];
}

export interface NetworkRequestMetadata {
  /**
   * Milliseconds since unix epoch when the request was sent
   */
  requestStartedAt: number;
}

export interface NetworkResponseMetadata {
  /**
   * Milliseconds since unix epoch when the request was sent
   */
  requestStartedAt: number;

  /**
   * Milliseconds since unix epoch when the response was received
   */
  responseReceivedAt: number;
}
