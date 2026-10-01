const COMPLETED_UPLOAD = Symbol("completedUpload");

export interface CompletedUploadDetails {
  sourceDeploymentId: string;
}

/** Remember a finished upload on an error thrown while triggering the run. */
export const withCompletedUpload = (
  error: unknown,
  details: CompletedUploadDetails,
): unknown => {
  if (typeof error === "object" && error != null) {
    Object.defineProperty(error, COMPLETED_UPLOAD, { value: details });
  }
  return error;
};

/** Keep a finished upload on an error that replaces the one it was attached to. */
export const carryCompletedUpload = (from: unknown, to: unknown): unknown => {
  const details = readCompletedUpload(from);
  return details ? withCompletedUpload(to, details) : to;
};

export const readCompletedUpload = (
  error: unknown,
): CompletedUploadDetails | undefined => {
  if (typeof error !== "object" || error == null) {
    return undefined;
  }
  const details = (error as { [COMPLETED_UPLOAD]?: CompletedUploadDetails })[
    COMPLETED_UPLOAD
  ];
  if (details == null || typeof details.sourceDeploymentId !== "string") {
    return undefined;
  }
  return details;
};
