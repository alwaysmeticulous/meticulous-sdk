export interface FetchError extends Error {
  response?:
    | {
        status: number;
        statusText: string;
        data: any;
        headers: Record<string, string>;
      }
    | undefined;
  config?:
    | {
        url: string;
        method?: string;
      }
    | undefined;
}

export const isFetchError = (error: any): error is FetchError => {
  return error && typeof error === "object" && error.response;
};

export const isAuthFailureStatus = (status: number | undefined): boolean =>
  status === 401 || status === 403;

/**
 * Guidance shown when a request fails with 401/403 and the CLI/client did not
 * attach an Authorization header. Environments may still inject auth into
 * outbound requests; this message covers both "token missing" and "injection
 * failed / invalid".
 */
export const MISSING_AUTH_GUIDANCE =
  "An API token is probably missing or invalid. Set METICULOUS_API_TOKEN, " +
  "pass --apiToken, or run `meticulous auth login`.";

export const maybeEnrichFetchError = <T = unknown>(error: T): T => {
  if (isFetchError(error)) {
    // buildClient may already have applied missing-auth guidance via
    // maybeEnrichMissingAuthFetchError. Rebuilding from the response body
    // would discard that guidance, so leave those errors alone.
    if (error.message.includes(MISSING_AUTH_GUIDANCE)) {
      return error;
    }
    return enrichFetchError(error) as T;
  }
  return error;
};

/**
 * When a request was made without an Authorization header and the server
 * responded 401/403, rewrite the error message with missing-auth guidance.
 * Returns the original error unchanged otherwise.
 */
export const maybeEnrichMissingAuthFetchError = <T = unknown>(
  error: T,
  hadAuthorizationHeader: boolean,
): T => {
  if (hadAuthorizationHeader || !isFetchError(error)) {
    return error;
  }
  if (!isAuthFailureStatus(error.response?.status)) {
    return error;
  }

  const status = error.response?.status;
  const newError = new Error(
    `Authentication failed (HTTP ${status}). ${MISSING_AUTH_GUIDANCE}`,
  ) as FetchError;
  newError.response = error.response;
  newError.config = error.config;
  return newError as T;
};

const enrichFetchError = (error: FetchError) => {
  const errorMessage = (error.response?.data as { message?: unknown } | null)
    ?.message;
  const requestAndResponse = requestAndResponseToString(
    error.config ?? null,
    error.response ?? null,
  );
  let message: string;
  if (errorMessage && typeof errorMessage === "string") {
    message = errorMessage;
    if (requestAndResponse) {
      message += `\n\n${requestAndResponse}`;
    }
  } else {
    message = requestAndResponse;
  }

  if (!message) {
    return error;
  }

  const newError = new Error(message) as FetchError;
  newError.response = error.response;
  newError.config = error.config;
  return newError;
};

const requestAndResponseToString = (
  request: { url: string; method?: string } | null,
  response: { status: number; statusText: string; data: any } | null,
) => {
  if (!request || !request.url) {
    return "";
  }
  if (response == null) {
    return `${requestToString(request)}`;
  }
  return `${requestToString(request)} returned ${responseToString(response)})`;
};

const requestToString = (request: { method?: string; url: string }) => {
  return `${request.method?.toUpperCase()}${request.method ? " " : ""}${
    request.url
  }`;
};

const responseToString = (response: {
  status: number;
  statusText: string;
  data: any;
}) => {
  const dataAsString = dataToString(response.data);
  return `${response.status} ${response.statusText}${
    dataAsString ? ` (${dataAsString})` : ""
  }`;
};

const dataToString = (data: unknown) => {
  if (typeof data === "string") {
    return truncate(data, 50);
  }
  if (!data) {
    return String(data);
  }
  try {
    return truncate(JSON.stringify(data), 50);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    return "";
  }
};

const truncate = (str: string, maxLength: number) => {
  return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
};
