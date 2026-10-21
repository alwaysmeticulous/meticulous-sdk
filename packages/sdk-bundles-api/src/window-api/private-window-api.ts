/**
 * This API is exposed on the window under `window.__meticulous`.
 *
 * Please do NOT use. This is designed for internal usage only.
 */
export interface MeticulousPrivateApi {
  earlyNetworkRecorder?: {
    dispose?: () => Promise<void>;
  };

  /** Initialises and starts Meticulous recording */
  initialiseRecorder?: () => void;

  stopRecording?: () => void;

  flushPendingPayloads?: () => Promise<void>;

  /**
   * Feature flag overrides a host (the Agent swarm recording browser) set for
   * this page at document start. Absent on ordinary recordings: a real user's
   * flags are whatever the application itself evaluates. Read only through the
   * resolver in recordts/src/utils/flag-override.ts, never directly.
   */
  flagOverrides?: Record<string, string | boolean>;
}
