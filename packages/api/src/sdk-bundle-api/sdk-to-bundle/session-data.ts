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
      state: IDBObjectStoreWithEntries[];
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
  serialize?: (value: any) => string;
  deserialize?: (value: string) => any;
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

export type IDBObjectStoreWithEntries = Omit<
  IDBObjectStoreMetadata,
  "serialize" | "deserialize"
> & {
  createObjectStoreOptions: IDBObjectStoreParameters;
  /**
   * Entry values are JSON stringified by default. JSON representable objects, arrays and primitives are supported.
   * For all other types (e.g. Date, Regex, ArrayBuffer etc.), you can define a custom [de]serialize function on the
   * object store metadata to dictate how the value should be mapped to/from strings. @see IDBObjectStoreMetadata
   */
  entries: { key?: SerializedIDBValidKey; value: string }[];
};

export type CustomData = {
  singletons: Record<string, string>;
  arrays: Record<string, string[]>;
};
