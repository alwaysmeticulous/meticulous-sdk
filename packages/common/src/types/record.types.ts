import type { DebugLogger } from "../logger/debug-logger";

export interface RecordSessionOptions {
  recordingToken: string;
  appCommitHash: string;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  recordingSnippet: string;
  earlyNetworkRecorderSnippet: string;
  width?: number | null | undefined;
  height?: number | null | undefined;
  uploadIntervalMs?: number | null | undefined;
  incognito?: boolean | null | undefined;
  cookieDir?: string | null | undefined;
  debugLogger?: DebugLogger | null | undefined;
  captureHttpOnlyCookies?: boolean;
  onDetectedSession?: (sessionId: string) => void;
}

export type RecordSessionFn = (options: RecordSessionOptions) => Promise<void>;
