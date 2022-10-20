/**
 * Meticulous record settings
 *
 * Settings are used to configure how Meticulous will record sessions.
 */
export interface RecordSettings {
  /** True iff recording should be disabled */
  disabled?: boolean;

  /** Upload interval for recording payloads in milliseconds */
  uploadIntervalMs?: number;
  /** Maximum recording session duration */
  maxSessionTimeMs?: number;
  /** True iff recording should not be abandonned */
  forceRecording?: boolean;

  /** Recording token identifying which project the session belongs to */
  recordingToken?: string;
  /** Client app commit hash */
  appCommitHash?: string;

  /** Playback settings */
  playback?: {
    /** True iff playback data is recorded */
    enabled?: boolean;
    /** Playback options */
    options?: {
      /** True iff inline CSS stylesheets are to be recorded */
      inlineStylesheet?: boolean;
    };
    plugins?: {
      nodeData?: {
        enabled?: boolean;
      };
    };
  };
}

/**
 * Meticulous record configuration
 *
 * The record configuration is immutable and represents the final parameter
 * values used during recording.
 */
export interface RecordConfig
  extends DeepRequired<Omit<RecordSettings, "disabled">> {
  /** Maximum number of data payloads which can be sent during recording */
  maxUploads: number;
  /** Recording start time */
  startTime: Date;
  windowHostname: string;
}

/**
 * Meticulous record state and functions
 */
export interface RecordState {
  /** Initialises and starts Meticulous recording */
  initialiseRecorder?: () => void;
}

type DeepRequired<T> = T extends object
  ? { [P in keyof T]-?: DeepRequired<T[P]> }
  : T;
