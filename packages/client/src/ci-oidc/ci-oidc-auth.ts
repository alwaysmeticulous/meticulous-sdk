import {
  executeWithRetry,
  initLogger,
  meticulousFetch,
} from "@alwaysmeticulous/common";
import type { Dispatcher, RequestInit } from "undici";
import {
  CI_OIDC_DEFAULT_AUDIENCE,
  type CiOidcExchangeResult,
  exchangeCiOidcToken,
} from "../api/ci-oidc.api";
import { getApiUrl } from "../http-request";

const GITHUB_ACTIONS_REQUEST_URL_ENV = "ACTIONS_ID_TOKEN_REQUEST_URL";
const GITHUB_ACTIONS_REQUEST_TOKEN_ENV = "ACTIONS_ID_TOKEN_REQUEST_TOKEN";
const METICULOUS_OIDC_TOKEN_ENV = "METICULOUS_OIDC_TOKEN";
const METICULOUS_PROJECT_ENV = "METICULOUS_PROJECT";
const METICULOUS_OIDC_AUDIENCE_ENV = "METICULOUS_OIDC_AUDIENCE";

const GITHUB_OIDC_TIMEOUT_MS = 30_000;

/**
 * Refresh cached GitHub Actions CI OIDC access tokens this far ahead of
 * `expiresAt` so an in-flight request does not race token expiry.
 */
const REFRESH_MARGIN_MS = 60_000;

export interface RequestGitHubActionsOidcTokenOptions {
  /** Audience claim (`aud`) to request. Defaults to `METICULOUS_OIDC_AUDIENCE` or `https://app.meticulous.ai`. */
  audience?: string | null | undefined;
  /** Optional custom undici dispatcher. */
  dispatcher?: Dispatcher | undefined;
  /** Optional abort signal. */
  signal?: AbortSignal | undefined;
  /** Environment map to read `ACTIONS_ID_TOKEN_*` from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv | undefined;
}

export interface ResolveCiOidcAccessTokenOptions {
  /** Explicit OIDC JWT; overrides `METICULOUS_OIDC_TOKEN` and GitHub Actions OIDC. */
  oidcToken?: string | null | undefined;
  /** `organization/project` slug; falls back to `METICULOUS_PROJECT`. */
  project?: string | null | undefined;
  /** Audience claim when requesting a GitHub Actions OIDC token; falls back to `METICULOUS_OIDC_AUDIENCE` or `https://app.meticulous.ai`. */
  audience?: string | null | undefined;
  /** Optional consumer identity appended to the exchange request User-Agent. */
  appInfo?: string | undefined;
  /** Optional custom undici dispatcher. */
  dispatcher?: Dispatcher | undefined;
  /** Optional abort signal. */
  signal?: AbortSignal | undefined;
  /** Environment map to read OIDC variables from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv | undefined;
}

interface CachedCiOidcToken {
  cacheKey: string;
  accessToken: string;
  expiresAtMs: number;
  refreshable: boolean;
}

let cachedToken: CachedCiOidcToken | null = null;
let inFlightExchange: {
  cacheKey: string;
  promise: Promise<CachedCiOidcToken>;
} | null = null;

/**
 * Exchanges CI OIDC credentials from the environment and caches the minted
 * `ci-oidc` workflow token in process memory. Caching prevents repeated
 * `resolveAuthToken` calls from re-submitting a single-use `METICULOUS_OIDC_TOKEN`
 * (whose `jti` is consumed on the first exchange) and refreshes GitHub Actions
 * tokens automatically ahead of expiry.
 */
export const resolveCachedCiOidcTokenForAuth = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => {
  const cacheKey = computeCacheKey(env);
  const now = Date.now();
  const stillValidCached =
    cachedToken != null &&
    cachedToken.cacheKey === cacheKey &&
    cachedToken.expiresAtMs > now
      ? cachedToken
      : null;

  if (
    stillValidCached != null &&
    stillValidCached.expiresAtMs - now >
      (stillValidCached.refreshable ? REFRESH_MARGIN_MS : 0)
  ) {
    return stillValidCached.accessToken;
  }

  let pending: Promise<CachedCiOidcToken>;
  if (inFlightExchange != null && inFlightExchange.cacheKey === cacheKey) {
    pending = inFlightExchange.promise;
  } else {
    const refreshable =
      !env[METICULOUS_OIDC_TOKEN_ENV]?.trim() && hasGitHubActionsOidcEnv(env);

    const exchangePromise = resolveCiOidcAccessToken({ env }).then((result) => {
      const parsedExpiry = Date.parse(result.expiresAt);
      const entry: CachedCiOidcToken = {
        cacheKey,
        accessToken: result.accessToken,
        // Fall back to a conservative lifetime if the server ever returns an
        // unparseable timestamp so single-use env tokens are still reused.
        expiresAtMs: Number.isFinite(parsedExpiry)
          ? parsedExpiry
          : Date.now() + 30 * 60_000,
        refreshable,
      };
      cachedToken = entry;
      return entry;
    });

    inFlightExchange = { cacheKey, promise: exchangePromise };
    pending = exchangePromise;
  }

  try {
    const resolved = await pending;
    return resolved.accessToken;
  } catch (error) {
    if (stillValidCached != null && stillValidCached.expiresAtMs > Date.now()) {
      initLogger().warn(
        `CI OIDC token refresh failed (${error instanceof Error ? error.message : String(error)}); continuing with cached token until expiry`,
      );
      return stillValidCached.accessToken;
    }
    throw error;
  } finally {
    if (inFlightExchange?.promise === pending) {
      inFlightExchange = null;
    }
  }
};

/** Exported for unit tests. */
export const clearCiOidcTokenCache = (): void => {
  cachedToken = null;
  inFlightExchange = null;
};

/**
 * Obtains a CI OIDC identity JWT (from explicit `oidcToken`, `METICULOUS_OIDC_TOKEN`,
 * or the GitHub Actions OIDC runtime) and exchanges it for a short-lived
 * Meticulous project-scoped API token.
 */
export const resolveCiOidcAccessToken = async (
  options: ResolveCiOidcAccessTokenOptions = {},
): Promise<CiOidcExchangeResult> => {
  const env = options.env ?? process.env;
  const explicitToken = options.oidcToken?.trim();
  const envToken = env[METICULOUS_OIDC_TOKEN_ENV]?.trim();
  const project =
    options.project?.trim() || env[METICULOUS_PROJECT_ENV]?.trim() || undefined;

  if (explicitToken || envToken) {
    return exchangeCiOidcToken({
      oidcToken: explicitToken || envToken!,
      project,
      appInfo: options.appInfo,
      dispatcher: options.dispatcher,
      signal: options.signal,
    });
  }

  if (hasGitHubActionsOidcEnv(env)) {
    return executeWithRetry(
      async () => {
        const oidcToken = await fetchGitHubActionsOidcTokenOnce({
          audience: options.audience,
          dispatcher: options.dispatcher,
          signal: options.signal,
          env,
        });
        return exchangeCiOidcToken({
          oidcToken,
          project,
          appInfo: options.appInfo,
          dispatcher: options.dispatcher,
          signal: options.signal,
        });
      },
      {
        signal: options.signal,
        logger: initLogger(),
        operationDescription: "CI OIDC token exchange (GitHub Actions)",
      },
    );
  }

  throw new Error(
    "No CI OIDC token source found. On GitHub Actions, grant " +
      "'permissions: id-token: write'. On other CI providers, pass " +
      "--oidcToken or set METICULOUS_OIDC_TOKEN.",
  );
};

/**
 * Requests a fresh OIDC identity JWT from the GitHub Actions runtime endpoint
 * (`ACTIONS_ID_TOKEN_REQUEST_URL`). Requires `permissions: id-token: write`.
 */
export const requestGitHubActionsOidcToken = async (
  options: RequestGitHubActionsOidcTokenOptions = {},
): Promise<string> => {
  return executeWithRetry(() => fetchGitHubActionsOidcTokenOnce(options), {
    signal: options.signal,
    logger: initLogger(),
    operationDescription: "GET GitHub Actions OIDC token",
  });
};

const fetchGitHubActionsOidcTokenOnce = async (
  options: RequestGitHubActionsOidcTokenOptions = {},
): Promise<string> => {
  const env = options.env ?? process.env;
  const requestUrl = env[GITHUB_ACTIONS_REQUEST_URL_ENV]?.trim();
  const requestToken = env[GITHUB_ACTIONS_REQUEST_TOKEN_ENV]?.trim();
  if (!requestUrl || !requestToken) {
    throw new Error(
      "GitHub Actions OIDC is not available (ACTIONS_ID_TOKEN_REQUEST_URL and " +
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set). Add 'permissions: id-token: write' " +
        "to your workflow job.",
    );
  }

  const audience =
    options.audience?.trim() ||
    env[METICULOUS_OIDC_AUDIENCE_ENV]?.trim() ||
    CI_OIDC_DEFAULT_AUDIENCE;

  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);

  const controller = new AbortController();
  const callerSignal = options.signal;
  const forwardAbort = (): void => controller.abort();
  if (callerSignal != null) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", forwardAbort, { once: true });
    }
  }
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GITHUB_OIDC_TIMEOUT_MS);

  let response: Awaited<ReturnType<typeof meticulousFetch>>;
  try {
    const requestInit: RequestInit = {
      method: "GET",
      headers: {
        authorization: `Bearer ${requestToken}`,
        accept: "application/json; api-version=2.0",
      },
      signal: controller.signal,
      ...(options.dispatcher != null ? { dispatcher: options.dispatcher } : {}),
    };
    response = await meticulousFetch(url.toString(), requestInit);
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }

  if (!response.ok) {
    const error = new Error(
      `Failed to request GitHub Actions OIDC token (HTTP ${response.status}: ${response.statusText}).`,
    );
    (error as { response?: unknown }).response = {
      status: response.status,
      statusText: response.statusText,
    };
    throw error;
  }

  const payload = (await response.json()) as { value?: unknown } | null;
  if (typeof payload?.value !== "string" || payload.value.trim() === "") {
    throw new Error(
      "GitHub Actions OIDC endpoint returned an unexpected response.",
    );
  }
  return payload.value;
};

export const hasCiOidcEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env[METICULOUS_OIDC_TOKEN_ENV]?.trim()) ||
  hasGitHubActionsOidcEnv(env);

export const hasGitHubActionsOidcEnv = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  Boolean(
    env[GITHUB_ACTIONS_REQUEST_URL_ENV]?.trim() &&
    env[GITHUB_ACTIONS_REQUEST_TOKEN_ENV]?.trim(),
  );

const computeCacheKey = (env: NodeJS.ProcessEnv): string =>
  JSON.stringify([
    getApiUrl(),
    env[METICULOUS_PROJECT_ENV]?.trim() ?? "",
    env[METICULOUS_OIDC_AUDIENCE_ENV]?.trim() ?? "",
    env[METICULOUS_OIDC_TOKEN_ENV]?.trim() ?? "",
    env[GITHUB_ACTIONS_REQUEST_URL_ENV]?.trim() ?? "",
  ]);
