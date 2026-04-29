export interface BackendRecorderConfig {
  enabled?: boolean;
  meticulousProjectName?: string;
  recordingToken?: string;
  exportMode?: "local" | "s3";
  localOutputDir?: string;
  flushIntervalMs?: number;
}
