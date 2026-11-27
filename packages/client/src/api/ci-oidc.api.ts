import { initLogger } from "@alwaysmeticulous/common";
import type { Dispatcher, RequestInit } from "undici";
import { maybeEnrichFetchError } from "../errors";
import { buildUserAgent, makeRequest } from "../http-request";

/**
 * Default `aud` claim requested from CI OIDC providers and expected by
 * Meticulous unless a custom trust policy overrides the audience.
 */
export const CI_OIDC_DEFAULT_AUDIENCE = "https://app.meticulous.ai";

export interface CiOidcExchangeOptions {
  /** Raw OIDC identity JWT issued by the CI provider. */
  oidcToken: string;
  /**
   * Optional `organization/project` identifier. Required when a custom issuer
   * cannot infer the project from repository claims or when multiple opted-in
   * projects link to the same repository.
   */
  project?: string | null | undefined;
  /** Optional consumer identity appended to the request User-Agent. */
  appInfo?: string | undefined;
  /** Optional custom undici dispatcher. */
  dispatcher?: Dispatcher | undefined;
  /** Optional abort signal. */
  signal?: AbortSignal | undefined;
}

export interface CiOidcExchangeResult {
  /** Short-lived Meticulous `ci-oidc` workflow API token (`wfat-...`). */
  accessToken: string;
  /** ISO 8601 UTC expiry timestamp. */
  expiresAt: string;
}

/**
 * Trades a CI provider's OIDC identity JWT for a short-lived Meticulous
 * project-scoped `ci-oidc` API token via `POST /api/ci-auth/oidc/exchange`.
 */
export const exchangeCiOidcToken = async (
  options: CiOidcExchangeOptions,
): Promise<CiOidcExchangeResult> => {
  const oidcToken = options.oidcToken.trim();
  if (!oidcToken) {
    throw new Error("Cannot exchange an empty CI OIDC token.");
  }

  const project = options.project?.trim() || undefined;
  const body = JSON.stringify(project ? { project } : {});
  const requestOptions: RequestInit = {
    method: "POST",
    body,
    ...(options.dispatcher != null ? { dispatcher: options.dispatcher } : {}),
  };

  let data: unknown;
  try {
    const response = await makeRequest<unknown>({
      url: "ci-auth/oidc/exchange",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "user-agent": buildUserAgent(options.appInfo),
      },
      options: requestOptions,
      config: {
        // Single-use `jti` replay protection means retrying the same JWT after
        // a lost response or 5xx can turn a transient failure into a 401
        // "already been used" error. Callers with a refreshable source (GitHub
        // Actions) retry by requesting a fresh OIDC JWT per attempt.
        retry: false,
        ...(options.signal != null ? { signal: options.signal } : {}),
      },
      logger: initLogger(),
    });
    data = response.data;
  } catch (error) {
    throw maybeEnrichFetchError(error);
  }

  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as { accessToken?: unknown }).accessToken !== "string" ||
    (data as { accessToken: string }).accessToken.length === 0 ||
    typeof (data as { expiresAt?: unknown }).expiresAt !== "string"
  ) {
    throw new Error(
      "Meticulous CI OIDC exchange returned an unexpected response.",
    );
  }

  const parsed = data as { accessToken: string; expiresAt: string };
  return {
    accessToken: parsed.accessToken,
    expiresAt: parsed.expiresAt,
  };
};
