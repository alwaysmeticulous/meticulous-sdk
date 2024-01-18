import { DebugLogger } from "@alwaysmeticulous/common";

export interface RecordSessionOptions {
  recordingToken: string;
  appCommitHash: string;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  recordingSnippetManualInit: string;
  width?: number | null | undefined;
  height?: number | null | undefined;
  uploadIntervalMs?: number | null | undefined;
  incognito?: boolean | null | undefined;
  cookieDir?: string | null | undefined;
  debugLogger?: DebugLogger | null | undefined;
  captureHttpOnlyCookies?: boolean;
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
