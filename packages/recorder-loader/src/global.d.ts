declare global {
  interface Window {
    // Meticulous snippet configuration
    METICULOUS_RECORDING_TOKEN: string;
    METICULOUS_UPLOAD_INTERVAL_MS?: number;
    METICULOUS_SNAPSHOT_LINKED_STYLESHEETS?: boolean;
    METICULOUS_APP_COMMIT_HASH?: string;

    __meticulous?: {
      initialiseRecorder: () => void;
    };
  }
}

export {};
