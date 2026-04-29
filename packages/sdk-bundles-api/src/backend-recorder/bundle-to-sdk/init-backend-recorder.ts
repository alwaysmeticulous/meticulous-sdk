export interface BackendRecorderHandle {
  stopRecording: () => Promise<void>;
}
