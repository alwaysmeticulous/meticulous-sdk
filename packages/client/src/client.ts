import {
  initLogger,
  executeWithRetry,
  defaultShouldRetry,
  meticulousFetch,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import type { RequestInit } from "undici";
import { getOAuthProjects } from "./api/oauth.api";
import { getApiToken, getAuthToken } from "./api-token.utils";
import { performOAuthLogin } from "./oauth/oauth-login";
import {
  getStoredProjectId,
  setStoredProject,
} from "./oauth/oauth-token-store";
import {
  MeticulousClient,
  RequestConfig,
  Response,
} from "./types/client.types";
import { VERSION } from "./version";

const DEFAULT_TIMEOUT = 60_000;
const BASE_API_URL = "https://app.meticulous.ai/api/";

// Sent on every request so the backend can attribute traffic to a client
// version (queryable in Datadog). This package is Node-only (it imports
// undici's fetch), so setting User-Agent is allowed. Callers may override it
// by passing their own `user-agent` header.
const USER_AGENT = `@alwaysmeticulous/client/${VERSION}`;

// Consumers can append their own identity to the User-Agent so backend logs
// attribute traffic to a specific consumer and version (e.g.
// `report-diffs-action/cloud-compute@v1`). The suffix is taken from the
// `appInfo` client option, falling back to the
// METICULOUS_CLIENT_USER_AGENT_SUFFIX env var — the env var covers clients that
// are created deep inside dependencies (e.g. the remote-replay-launcher builds
// its own client) where threading an option through is not possible.
const USER_AGENT_SUFFIX_ENV_VAR = "METICULOUS_CLIENT_USER_AGENT_SUFFIX";

// Exported for unit testing; not re-exported from the package index.
export const buildUserAgent = (appInfo?: string): string => {
  const suffix =
    appInfo?.trim() || process.env[USER_AGENT_SUFFIX_ENV_VAR]?.trim();
  return suffix ? `${USER_AGENT} ${suffix}` : USER_AGENT;
};

export interface ClientOptions {
  apiToken: string | null | undefined;

  /**
   * Optional identifier for the consuming application, appended to the
   * User-Agent of every request (e.g. `report-diffs-action/cloud-compute@v1`).
   * Use it to attribute backend traffic to a specific consumer/version.
   */
  appInfo?: string;
}

export interface MakeRequestOptions {
  url: string;
  headers: Record<string, string>;
  options: RequestInit;
  config: RequestConfig<any>;
  logger: log.Logger;
}

const makeSingleRequest = async <T>(
  url: string,
  options: RequestInit,
  timeout?: number,
): Promise<Response<T>> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout ?? DEFAULT_TIMEOUT);
  const response = await meticulousFetch(url, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => {
    responseHeaders[key] = value;
  });

  let data: T;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = (await response.json()) as T;
  } else {
    data = (await response.text()) as T;
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    (error as any).response = {
      status: response.status,
      statusText: response.statusText,
      data,
      headers: responseHeaders,
    };
    (error as any).config = { url, ...options };
    throw error;
  }

  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  };
};

const combineUrls = (baseUrl: string, path: string): string => {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${relativePath}`;
};

export const makeRequest = async <T>(
  requestOptions: MakeRequestOptions,
): Promise<Response<T>> => {
  const { url, headers, options, config = {}, logger } = requestOptions;
  let finalUrl = combineUrls(getApiUrl(), url);

  const finalHeaders = {
    "Content-Type": "application/json",
    "user-agent": buildUserAgent(),
    ...headers,
    ...config.headers,
    ...options.headers,
  };

  if (config.params) {
    const urlWithParams = new URL(finalUrl);
    Object.entries(config.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        urlWithParams.searchParams.append(key, String(value));
      }
    });
    finalUrl = urlWithParams.toString();
  }

  const requestInit: RequestInit = {
    ...options,
    headers: finalHeaders,
  };

  return await executeWithRetry(
    () => makeSingleRequest(finalUrl, requestInit, config.timeout),
    {
      shouldRetry: defaultShouldRetry,
      logger,
    },
  );
};

const buildClient = (
  token: string,
  logger: log.Logger,
  appInfo?: string,
): MeticulousClient => {
  const userAgent = buildUserAgent(appInfo);
  const makeRequestWithToken = async <T>(
    url: string,
    options: RequestInit = {},
    config?: RequestConfig<any>,
  ): Promise<Response<T>> => {
    const headers = {
      authorization: token,
      "user-agent": userAgent,
    };

    return makeRequest<T>({
      url,
      headers,
      options,
      config: config || {},
      logger,
    });
  };

  return {
    get: <T = any, R = Response<T>>(
      url: string,
      config?: RequestConfig<any>,
    ): Promise<R> => {
      return makeRequestWithToken<T>(
        url,
        { method: "GET" },
        config,
      ) as Promise<R>;
    },

    post: <T = any, R = Response<T>, D = any>(
      url: string,
      data?: D,
      config?: RequestConfig<any>,
    ): Promise<R> => {
      const body = data !== undefined ? JSON.stringify(data) : undefined;
      const requestOptions: RequestInit = { method: "POST" };
      if (body !== undefined) {
        requestOptions.body = body;
      }
      return makeRequestWithToken<T>(url, requestOptions, config) as Promise<R>;
    },

    put: <T = any, R = Response<T>, D = any>(
      url: string,
      data?: D,
      config?: RequestConfig<any>,
    ): Promise<R> => {
      const body = data !== undefined ? JSON.stringify(data) : undefined;
      const requestOptions: RequestInit = { method: "PUT" };
      if (body !== undefined) {
        requestOptions.body = body;
      }
      return makeRequestWithToken<T>(url, requestOptions, config) as Promise<R>;
    },
  };
};

export const createClient: (options: ClientOptions) => MeticulousClient = ({
  apiToken: apiToken_,
  appInfo,
}) => {
  const logger = initLogger();
  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  return buildClient(apiToken, logger, appInfo);
};

export const isInteractiveContext = (): boolean =>
  process.stdin.isTTY === true && !process.env["CI"];

/**
 * Resolves an API token using the full auth chain (explicit token → env var →
 * stored OAuth → legacy config file), and falls back to an interactive browser
 * OAuth login when nothing is stored and the process is attached to a TTY.
 *
 * Exits the process with code 1 if no token can be obtained. Use this anywhere
 * a CLI command needs an API token — either to build a client (see
 * `createClientWithOAuth`) or to pass directly to a launcher.
 */
export const resolveApiTokenWithOAuth = async (
  options: ClientOptions & { enableOAuthLogin?: boolean },
): Promise<string> => {
  const logger = initLogger();

  let apiToken = await getAuthToken(options.apiToken);

  const isInteractive =
    options.enableOAuthLogin && isInteractiveContext();

  if (!apiToken && isInteractive) {
    const tokens = await performOAuthLogin();
    apiToken = tokens.accessToken;
    await maybeAutoSelectProject(apiToken, logger);
  }

  if (!apiToken) {
    const message = isInteractive
      ? "No authentication found. Use --apiToken, set METICULOUS_API_TOKEN, or log in via browser."
      : "No authentication found. Set METICULOUS_API_TOKEN or pass --apiToken.";
    logger.error(message);
    return process.exit(1);
  }

  return apiToken;
};

/**
 * After a fresh OAuth login, if the user has access to exactly one project
 * and none has been stored yet, picks it automatically. Best-effort: any
 * failure (network, missing backend endpoint, etc.) is logged at debug and
 * swallowed — the user can always run `meticulous auth set-project` later.
 */
const maybeAutoSelectProject = async (
  apiToken: string,
  logger: log.Logger,
): Promise<void> => {
  if (getStoredProjectId()) {
    return;
  }
  try {
    const client = buildClient(apiToken, logger);
    const projects = await getOAuthProjects(client);
    if (projects.length === 1) {
      const only = projects[0];
      const projectSlug = `${only.organization.name}/${only.name}`;
      setStoredProject({ project: projectSlug, projectId: only.id });
      logger.info(`Selected project: ${projectSlug}`);
    }
  } catch (error) {
    logger.debug(`Skipping auto-project selection after login: ${error}`);
  }
};

export const createClientWithOAuth = async (
  options: ClientOptions & { enableOAuthLogin?: boolean },
): Promise<MeticulousClient> => {
  const apiToken = await resolveApiTokenWithOAuth(options);
  return buildClient(apiToken, initLogger(), options.appInfo);
};

const getApiUrl = () => {
  if (process.env["METICULOUS_API_URL"]) {
    return process.env["METICULOUS_API_URL"];
  }
  return BASE_API_URL;
};
