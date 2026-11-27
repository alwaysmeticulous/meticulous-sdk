import { initLogger, logProgress } from "@alwaysmeticulous/common";
import type log from "loglevel";
import type { Dispatcher, RequestInit } from "undici";
import {
  getApiToken,
  readFileBasedToken,
  resolveAuthToken,
} from "./api-token.utils";
import type { AuthTokenResolution } from "./auth-resolution.types";
import { hasGitHubActionsOidcEnv } from "./ci-oidc/ci-oidc-auth";
import {
  maybeEnrichMissingAuthFetchError,
  maybeTagRejectedCredentialsError,
} from "./errors";
import {
  buildUserAgent,
  declareClientAppInfo,
  describeRuntime,
  makeRequest,
  type MakeRequestOptions,
} from "./http-request";
import { performOAuthLogin } from "./oauth/oauth-login";
import { getStoredOAuthTokens } from "./oauth/oauth-token-store";
import { isOAuthJwt } from "./oauth/oauth-utils";
import { migrateLegacySelectedProjectIfPresent } from "./oauth/legacy-project-migration";
import type {
  MeticulousClient,
  RequestConfig,
  Response,
} from "./types/client.types";

export {
  buildUserAgent,
  declareClientAppInfo,
  describeRuntime,
  makeRequest,
  type MakeRequestOptions,
};

export interface ClientOptions {
  apiToken: string | null | undefined;

  /**
   * Optional identifier for the consuming application, appended to the
   * User-Agent of every request (e.g. `report-diffs-action/cloud-compute@v1`).
   * Use it to attribute backend traffic to a specific consumer/version.
   */
  appInfo?: string;

  /**
   * Sends this client's requests through its own undici dispatcher instead of
   * the process-wide pool. The dispatcher replaces the default proxy handling
   * from `HTTP(S)_PROXY`. The caller owns its lifetime.
   */
  dispatcher?: Dispatcher;
}

type StaticToken = string | null | AuthTokenResolution;

/**
 * The token to authenticate requests with. A static token is used as-is for
 * the client's lifetime; a provider function is invoked on every request so the
 * token can be refreshed (e.g. short-lived OAuth access tokens). No token means
 * the request is sent without an Authorization header (some environments
 * inject auth themselves); an {@link AuthTokenResolution} without a token says
 * why, for the error if the server then rejects the request. A bare `null`
 * comes from the static token chain (explicit token → METICULOUS_API_TOKEN →
 * config file), so such a rejection is explained by the stored OAuth login.
 */
type TokenProvider = StaticToken | (() => Promise<StaticToken>);

// Exported for unit testing; not re-exported from the package index.
export const buildClient = (
  token: TokenProvider,
  logger: log.Logger,
  appInfo?: string,
  dispatcher?: Dispatcher,
): MeticulousClient => {
  const userAgent = buildUserAgent(appInfo);
  const getToken = async (): Promise<StaticToken> =>
    typeof token === "function" ? token() : token;
  const makeRequestWithToken = async <T>(
    url: string,
    options: RequestInit = {},
    config?: RequestConfig<any>,
  ): Promise<Response<T>> => {
    const resolvedToken = await getToken();
    const sentToken = isAuthTokenResolution(resolvedToken)
      ? resolvedToken.token
      : resolvedToken;
    const headers: Record<string, string> = {
      "user-agent": userAgent,
    };
    if (sentToken) {
      headers.authorization = sentToken;
    }

    try {
      return await makeRequest<T>({
        url,
        headers,
        options: dispatcher != null ? { ...options, dispatcher } : options,
        config: config || {},
        logger,
      });
    } catch (error) {
      if (sentToken) {
        throw maybeTagRejectedCredentialsError(error, sentToken);
      }
      throw maybeEnrichMissingAuthFetchError(
        error,
        isAuthTokenResolution(resolvedToken) ? resolvedToken : false,
      );
    }
  };

  return {
    get: <T = any>(
      url: string,
      config?: RequestConfig<any>,
    ): Promise<Response<T>> => {
      return makeRequestWithToken<T>(url, { method: "GET" }, config);
    },

    post: <T = any, D = any>(
      url: string,
      data?: D,
      config?: RequestConfig<any>,
    ): Promise<Response<T>> => {
      const body = data !== undefined ? JSON.stringify(data) : undefined;
      const requestOptions: RequestInit = { method: "POST" };
      if (body !== undefined) {
        requestOptions.body = body;
      }
      return makeRequestWithToken<T>(url, requestOptions, config);
    },

    put: <T = any, D = any>(
      url: string,
      data?: D,
      config?: RequestConfig<any>,
    ): Promise<Response<T>> => {
      const body = data !== undefined ? JSON.stringify(data) : undefined;
      const requestOptions: RequestInit = { method: "PUT" };
      if (body !== undefined) {
        requestOptions.body = body;
      }
      return makeRequestWithToken<T>(url, requestOptions, config);
    },

    delete: <T = any>(
      url: string,
      config?: RequestConfig<any>,
    ): Promise<Response<T>> => {
      return makeRequestWithToken<T>(url, { method: "DELETE" }, config);
    },
  };
};

export const createClient: (options: ClientOptions) => MeticulousClient = ({
  apiToken: apiToken_,
  appInfo,
  dispatcher,
}) => {
  const logger = initLogger();
  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    // logProgress writes to stderr (keeping stdout machine-readable) and is
    // visible at default verbosity — unlike logger.debug, which is hidden by
    // default — so users get a hint that requests are going out
    // unauthenticated before one fails.
    logProgress("No API token found; proceeding with unauthenticated requests");
  }

  return buildClient(apiToken, logger, appInfo, dispatcher);
};

export const isInteractiveContext = (): boolean =>
  process.stdin.isTTY === true && !process.env["CI"];

/**
 * Resolves an API token using the full auth chain (explicit token → env var →
 * stored OAuth → legacy config file), and falls back to an interactive browser
 * OAuth login when no OAuth login is stored and the process is attached to a
 * TTY. A stored login whose refresh failed transiently is kept and does not
 * trigger a new browser login: this returns `null`, and a later call retries
 * the refresh.
 *
 * Returns `null` if no token can be obtained (instead of exiting). Callers
 * should proceed with unauthenticated requests — some environments inject auth
 * into outbound traffic. Use this anywhere a CLI command needs an API token —
 * either to build a client (see `createClientWithOAuth`) or to pass directly
 * to a launcher.
 */
export const resolveApiTokenWithOAuth = async (
  options: ClientOptions & { enableOAuthLogin?: boolean },
): Promise<string | null> =>
  (await resolveAuthTokenWithOAuthLogin(options)).token;

/**
 * {@link resolveApiTokenWithOAuth}, keeping why no token resolved so a
 * client built from it can explain a later 401/403.
 */
const resolveAuthTokenWithOAuthLogin = async (
  options: ClientOptions & { enableOAuthLogin?: boolean },
): Promise<AuthTokenResolution> => {
  const logger = initLogger();

  let resolution = await resolveAuthToken(options.apiToken);

  const isInteractive = options.enableOAuthLogin && isInteractiveContext();

  // A rejected refresh has already cleared the store, so this still logs in
  // again; only a transient refresh failure or explicit CI OIDC attempt skips
  // launching a browser login.
  if (
    resolution.token === null &&
    resolution.missingReason.kind !== "ci-oidc-failed" &&
    isInteractive &&
    getStoredOAuthTokens() == null
  ) {
    const tokens = await performOAuthLogin();
    resolution = { token: tokens.accessToken };
  }

  if (!resolution.token) {
    // See the matching logProgress in createClient for why not logger.debug.
    logProgress(
      resolution.token === null &&
        resolution.missingReason.kind === "ci-oidc-failed"
        ? `CI OIDC authentication failed (${resolution.missingReason.detail}); proceeding with unauthenticated requests`
        : "No usable Meticulous login or API token found; proceeding with unauthenticated requests",
    );
    return resolution;
  }
  const apiToken = resolution.token;

  // Best-effort, one-time upgrade of the pre-backend local
  // `selected-project.json` into the backend-persisted default. This is the
  // shared OAuth token-init path (used by `createClientWithOAuth` and directly
  // by `upload-build`), so every OAuth-authenticated command triggers the
  // migration — not just the few that still resolve the default client-side.
  // Gated on an OAuth token and the file's presence, so it's an instant no-op
  // once migrated.
  if (isOAuthJwt(apiToken)) {
    await migrateLegacySelectedProjectIfPresent(
      apiToken,
      logger,
      options.appInfo,
    );
  }

  return resolution;
};

export const createClientWithOAuth = async (
  options: ClientOptions & { enableOAuthLogin?: boolean },
): Promise<MeticulousClient> => {
  // Resolve once up front: this performs the interactive browser login when
  // needed (and any post-login project auto-select).
  const initial = await resolveAuthTokenWithOAuthLogin(options);

  // OAuth access tokens are short-lived, so a client that bakes in a single
  // token starts failing once it expires — e.g. during a long poll loop waiting
  // for a test run to complete. When the token came from OAuth, install a
  // provider that re-resolves the full auth chain per request via
  // `resolveAuthToken` (which auto-refreshes the OAuth token via the stored refresh
  // token); static tokens (explicit / env var / config file) never expire, so
  // we keep using the resolved string directly to avoid re-reading it on every
  // request. Re-resolving the whole chain — rather than only `getValidAccessToken` —
  // matters when the refresh itself fails: `getValidAccessToken` then returns
  // null (clearing the stored OAuth tokens only if the server rejected the
  // refresh token), and `resolveAuthToken` falls back to the METICULOUS_API_TOKEN
  // env var / config file. When none of those resolve, the request goes out
  // without credentials, so a 401/403 is explained by why the login was lost
  // (expired, rejected, cleared) rather than by the server rejecting a stale
  // token.
  const usingOAuth = !options.apiToken && getStoredOAuthTokens() != null;
  const usingRefreshableCiOidc =
    !options.apiToken &&
    !usingOAuth &&
    initial.token != null &&
    hasGitHubActionsOidcEnv() &&
    !process.env["METICULOUS_API_TOKEN"] &&
    !process.env["METICULOUS_OIDC_TOKEN"]?.trim() &&
    readFileBasedToken() == null;

  const token: TokenProvider = usingOAuth
    ? async () => reresolveOAuthToken(options.apiToken)
    : usingRefreshableCiOidc
      ? async () => resolveAuthToken(options.apiToken)
      : initial;

  return buildClient(token, initLogger(), options.appInfo, options.dispatcher);
};

const reresolveOAuthToken = async (
  apiToken: string | null | undefined,
): Promise<AuthTokenResolution> => {
  const current = await resolveAuthToken(apiToken);
  if (current.token !== null) {
    return current;
  }
  // A login was stored when this client was created, so finding none now
  // means it was removed mid-command rather than never having existed.
  return current.missingReason.kind === "not-logged-in"
    ? { token: null, missingReason: { kind: "login-cleared" } }
    : current;
};

const isAuthTokenResolution = (
  token: StaticToken,
): token is AuthTokenResolution => token != null && typeof token === "object";
