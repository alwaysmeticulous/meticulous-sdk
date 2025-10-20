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

  flushPendingPayloads?: Promise<void>;
}
