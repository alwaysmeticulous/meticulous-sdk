import { ReplayableEvent } from "../bidirectional/replayable-event";
import { HarLog } from "./har-log";
import { WebSocketConnectionData } from "./websocket-data";

export interface SessionData {
  userEvents: {
    window: WindowData;
    event_log: ReplayableEvent[];
  };

  pollyHAR: {
    pollyHAR?: { [recordingId: `Meticulous_${string}`]: { log: HarLog } };
  };

  /**
   * Note: the name 'randomEvents' is a misnomer: it should be named 'storage'.
   */
  randomEvents: {
    localStorage: {
      state: StorageEntry[];
    };

    /**
     * Only present on recordings since ~Dec 2023
     */
    sessionStorage?: {
      state: StorageEntry[];
    };

    /**
     * Only present on recordings since ~Aug 2024
     */
    indexedDb?: {
      /**
       * createObjectStoreOptions will be omitted when snapshotting an object store entry on the fly.
       * @see IDBObjectStoreMetadata.snapshotEntriesOnRead for more details.
       */
      state: (
        | IDBObjectStoreSnapshot
        | Omit<IDBObjectStoreSnapshot, "createObjectStoreOptions">
      )[];
    };
  };

  /**
   * Only present on recordings since ~March 2024
   */
  webSocketData?: WebSocketConnectionData[];

  cookies: Cookie[];
  urlHistory: UrlHistoryEvent[];
  rrwebEvents: unknown[];
  recording_token: string;
  datetime_first_payload: string;
  hostname: string;
  abandoned: boolean;

  /**
   * Only present on recordings since ~Oct 2024
   */
  customData?: CustomData;

  /**
   * @deprecated This isn't set for new sessions.
   */
  requestsBeforeNetworkRecordingStarted?: EarlyRequest[];
  applicationSpecificData?: ApplicationSpecificData;
}

export interface WindowData {
  startUrl: string;
  width: number;
  height: number;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string | null;
  expires: number | null;
  path?: string;
  partitioned?: boolean;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
  httpOnly?: boolean;
}

export interface UrlHistoryEvent {
  timestamp: number;

  url: string;

  /**
   * Some frameworks, like next.js expose the router's current URL's pattern e.g. '/projects/[organizationName]/[projectName]'.
   *
   * If so, we include the pattern here.
   */
  urlPattern?: string;
}

export type StorageEntry = { key: string; value: string };

export interface ApplicationSpecificData {
  nextJs?: {
    props?: Record<string, unknown>;
    page?: string;
    query?: Record<string, string>;
    buildId?: string;
    isFallback?: boolean;
    gsp?: boolean;
    gip?: boolean;
    scriptLoader?: Record<string, unknown>;
    locale?: string;
  };
}

export interface EarlyRequest {
  url: string;
  initiatorType: "fetch" | "xmlhttprequest";
  startTime: number;
  duration: number;
}

export interface IDBObjectStoreMetadata {
  databaseName: string;
  objectStoreName: string;
  /**
   * If true, then we only snapshot the entries as they are read from the object store.
   * This can be useful if the object store is typically large and we don't want to snapshot
   * the entire thing.
   */
  snapshotEntriesOnRead?: boolean;
  serialize?: (value: any) => string;
  deserialize?: (value: string) => any;
  /**
   * For object stores with known data structures, we can estimate the length more efficiently
   * than our standard estimateLength() function by looking at specific fields. If the value
   * returned by this method exceeds the recording environment's maximum IDB entry length,
   * we will not attempt to serialize or record the value.
   */
  estimateLength?: (value: any) => number;
}

/**
 * Currently we only support string keys, but we may support other types in the future.
 * Keys are:
 * - Serialized in recorder/src/storage/storage.ts
 * - Deserialized in puppeteer-utils/src/browser-context/storage.ts
 *
 * @see IDBValidKey for all possible types.
 */
export type SerializedIDBValidKey = StringKey;

interface StringKey {
  type: "string";
  serializedKey: string;
}

export type IDBObjectStoreSnapshot = Pick<
  IDBObjectStoreMetadata,
  "databaseName" | "objectStoreName"
> & {
  createObjectStoreOptions: IDBObjectStoreParameters;
  /**
   * Entry values are serialized with SuperJSON by default. JSON representable objects, arrays and primitives are
   * supported as well as more complex types (e.g. Date, Regex, ArrayBuffer etc.). However, you can add custom
   * serialization logic to the object store metadata to support object store specific types.
   * @see IDBObjectStoreMetadata.serialize
   */
  entries: {
    key?: SerializedIDBValidKey;
    value: string;
    /**
     * This may be present for snapshots taken since ~Dec 2024 when we started using SuperJSON.
     * If it's present, this field stores the SuperJSONResult.meta field, with the stringified
     * text of SuperJSON.json being stored in the value field above.
     */
    valueMeta?: {
      values?: unknown;
      referentialEqualities?: unknown;
    };
  }[];

  /**
   * This is only present on IDB snapshots taken since ~Dec 2024.
   * It contains the indexes of the object store. In particular, these are the arguments that need to be provided to
   * the `createIndex` method on the IDBObjectStore object to re-create the indexes that existed at the time of the
   * snapshot.
   */
  indexes?: IDBIndexSnapshot[];
};

/**
 * @deprecated Use {@link IDBObjectStoreSnapshot} instead.
 */
export type IDBObjectStoreWithEntries = IDBObjectStoreSnapshot;

export type IDBIndexSnapshot = {
  name: string;
  keyPath: string | string[];
  options: {
    unique: boolean;
    multiEntry: boolean;
  };
};

export type CustomUserEvent = {
  type: string;
  /**
   * The timestamp based on performance.now() in the browser when the event was recorded.
   */
  timestamp: number;
  data: string;
};

export enum CustomDataSingletonInternalKey {
  SystemThemePreferredColor = "met-system-theme-preferred-color",

  /**
   * System timezone of the browser the session was recorded on. This is an IANA timezone string,
   * as defined in https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab
   * For example, "America/New_York" or "Europe/Paris".
   * Present on recordings since ~Feb 2025.
   */
  TimezoneName = "met-timezone-name",

  /**
   * The browser's languages as given by `navigator.languages`. This is a comma-separated list of
   * language tags, as defined in RFC 5646:
   * https://datatracker.ietf.org/doc/html/rfc5646
   * Present on recordings since ~Feb 2025.
   */
  Languages = "met-languages",
}

export type CustomDataSingletonInternalValues = {
  [CustomDataSingletonInternalKey.SystemThemePreferredColor]: "light" | "dark";
  [CustomDataSingletonInternalKey.TimezoneName]: string;
  [CustomDataSingletonInternalKey.Languages]: string;
};

export type CustomData = {
  singletons: Record<string, string> &
    Partial<CustomDataSingletonInternalValues>;
  arrays: Record<string, string[]>;
  events: CustomUserEvent[];
};
