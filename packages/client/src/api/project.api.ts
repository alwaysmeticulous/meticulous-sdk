import { Project } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export interface GetRepoUrlOptions {
  client: MeticulousClient;
}

export interface RepoUrlResponse {
  repoUrl: string;
  caCertificate?: string;
}

export const getProject: (
  client: MeticulousClient,
) => Promise<Project | null> = async (client) => {
  const { data } = await client
    .get<Project>("projects/token-info")
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getRepoUrl = async ({
  client,
}: GetRepoUrlOptions): Promise<RepoUrlResponse> => {
  const { data } = await client
    .get<unknown, { data: RepoUrlResponse }>("projects/repo-url")
    .catch((error) => {
      if (isFetchError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data;
};

/**
 * Response of `GET /api/projects/source-archive-url`. Only returned for
 * projects on the source-code-upload workflow.
 *
 * Callers that also need a diff between the resolved head commit and a base
 * commit should make a separate call to `compare-commits` (already handles
 * GitHub and GitLab).
 */
export interface SourceArchiveUrlResponse {
  /** Short-lived signed URL the caller can `GET` to download the archive. */
  downloadUrl: string;
  /**
   * The actual commit SHA the archive corresponds to. May differ from the
   * requested `commitSha` for session-selection / experiment runs (where the
   * backend walks the default branch to find the latest archive).
   */
  resolvedCommitSha: string;
}

export interface GetSourceArchiveUrlOptions {
  client: MeticulousClient;

  /**
   * The commit to fetch source code for. For session-selection / experiment
   * runs pass `"unknown"`/`"experiment"`; the backend will resolve to the
   * latest default-branch commit that has an uploaded archive.
   */
  commitSha: string;
}

/**
 * Returns a signed download URL for the uploaded source-code archive at
 * `commitSha`. Backed by `GET /api/projects/source-archive-url`.
 *
 * Only callable for projects with `usesSourceCodeUploads === true` (the
 * backend returns 403 otherwise). Returns 404 (surfaced as a thrown error)
 * if no archive has been uploaded for the requested commit and none of the
 * recent default-branch commits have an archive either; the backend never
 * falls back to a `git clone` URL.
 */
export const getSourceArchiveUrl = async ({
  client,
  commitSha,
}: GetSourceArchiveUrlOptions): Promise<SourceArchiveUrlResponse> => {
  const params = new URLSearchParams();
  params.set("commitSha", commitSha);
  const path = `projects/source-archive-url?${params.toString()}`;

  const { data } = await client
    .get<unknown, { data: SourceArchiveUrlResponse }>(path)
    .catch((error) => {
      if (isFetchError(error)) {
        const errorMessage = error.response?.data?.message;
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }
      throw error;
    });

  return data;
};

export interface RequestSourceCodeUploadUrlParams {
  client: MeticulousClient;
  commitSha: string;
  /** Optional content-length so the backend can lock the URL to a fixed size. */
  size?: number;
}

export interface RequestSourceCodeUploadUrlResponse {
  uploadUrl: string;
}

/**
 * Requests a short-lived signed URL the caller can `PUT` a `source.tar.gz`
 * archive of the customer's repo to, for the given commit. Backed by
 * `POST /api/projects/source-code-upload-url`.
 *
 * The backend rejects the call with a 403 when the project is not enabled
 * for source-code uploads.
 */
export const requestSourceCodeUploadUrl = async ({
  client,
  commitSha,
  size,
}: RequestSourceCodeUploadUrlParams): Promise<RequestSourceCodeUploadUrlResponse> => {
  const { data } = await client
    .post<unknown, { data: RequestSourceCodeUploadUrlResponse }>(
      "projects/source-code-upload-url",
      { commitSha, ...(size != null ? { size } : {}) },
    )
    .catch((error) => {
      if (isFetchError(error)) {
        const errorMessage = error.response?.data?.message;
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }
      throw error;
    });

  return data;
};
