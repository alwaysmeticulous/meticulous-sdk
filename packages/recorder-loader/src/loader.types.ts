export interface LoaderOptions {
  projectId: string;
  uploadIntervalMs?: number;
  snapshotLinkedStylesheets?: boolean;
  commitHash?: string;

  maxMsToBlockFor?: number;
  snippetsBaseUrl?: string;
}
