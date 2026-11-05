import type { DebugLogger } from "@alwaysmeticulous/common";
import type { CookieData } from "puppeteer-core";

/** Login state to load into the recording browser before the app first loads. */
export interface RecordStorageToSeed {
  cookies: CookieData[];
  /** Local storage entries for {@link RecordSessionOptions.appUrl}'s origin. */
  localStorageEntries: { key: string; value: string }[];
}

export interface RecordSessionOptions {
  recordingToken: string;
  appCommitHash: string;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  recordingSnippet: string;
  workerRecordingSnippet: string;
  width?: number | null | undefined;
  height?: number | null | undefined;
  uploadIntervalMs?: number | null | undefined;
  incognito?: boolean | null | undefined;
  cookieDir?: string | null | undefined;
  debugLogger?: DebugLogger | null | undefined;
  captureHttpOnlyCookies?: boolean;

  /** If set will jump straight to recording from this URL */
  appUrl?: string | null | undefined;
  /** If set, will set the max payload size for the session */
  maxPayloadSize?: number | null | undefined;
  /** If set, exposes Chrome DevTools Protocol on this port for external agents */
  remoteDebuggingPort?: number | null | undefined;
  /** If set, runs the browser headless (only useful when an external agent drives it via {@link remoteDebuggingPort}) */
  headless?: boolean | null | undefined;
  onDetectedSession?: (sessionId: string) => void;
  /**
   * Seeds the browser with this login state. Requires {@link appUrl}. Replaces the
   * cookies otherwise restored from and saved to {@link cookieDir}.
   */
  storageToSeed?: RecordStorageToSeed | null | undefined;
}

export type RecordLoginFlowOptions = Omit<
  RecordSessionOptions,
  | "appCommitHash"
  | "incognito"
  | "cookieDir"
  | "debugLogger"
  | "onDetectedSession"
  | "headless"
  | "storageToSeed"
>;
