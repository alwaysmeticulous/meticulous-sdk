import type { DebugLogger } from "../logger/debug-logger";

export interface RecordSessionOptions {
  browser: any;
  project: any;
  recordingToken: string;
  appCommitHash: string;
  devTools?: boolean | null | undefined;
  bypassCSP?: boolean | null | undefined;
  verbose?: boolean | null | undefined;
  recordingSnippet: string;
  earlyNetworkRecorderSnippet: string;
  width?: number | null | undefined;
  height?: number | null | undefined;
  uploadIntervalMs?: number | null | undefined;
  incognito?: boolean | null | undefined;
  cookieDir?: string | null | undefined;
  debugLogger?: DebugLogger | null | undefined;
  onDetectedSession?: (sessionId: string) => void;
}

export type RecordSessionFn = (options: RecordSessionOptions) => Promise<void>;
