export interface LabelCommitOptions {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  labels: string[];
}

export interface LabelCommitResult {
  commitSha: string;
  labels: string[];
}
