export interface BackendRecorderConfig {
  /** Enable/disable the recorder. Defaults to `true`. */
  enabled?: boolean;
  /** The name of the Meticulous project. */
  meticulousProjectName?: string;
  /** Token used to authenticate span uploads. */
  recordingToken?: string;
  /** Where to export spans. Defaults to `"local"`. */
  exportMode?: "local" | "s3";
  /** Directory for local exports. Only used when `exportMode` is `"local"`. */
  localOutputDir?: string;
  /** How often to flush spans, in milliseconds. */
  flushIntervalMs?: number;
}
