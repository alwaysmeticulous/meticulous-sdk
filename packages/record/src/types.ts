import { DebugLogger } from "@alwaysmeticulous/common";

export interface RecordSessionOptions {
  recordingToken: string;
  appCommitHash: string;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  recordingSnippet: string;
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
  onDetectedSession?: (sessionId: string) => void;
}

export type RecordLoginFlowOptions = Omit<
  RecordSessionOptions,
  | "appCommitHash"
  | "incognito"
  | "cookieDir"
  | "debugLogger"
  | "onDetectedSession"
>;
