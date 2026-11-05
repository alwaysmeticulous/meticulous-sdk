import type { FetchError } from "./errors";

/**
 * A readable message for a failed request: the server's own message (when its
 * body has one) followed by the request and response, or an empty string when
 * there is nothing to describe.
 */
export const describeFetchError = (error: FetchError): string => {
  const errorMessage = (error.response?.data as { message?: unknown } | null)
    ?.message;
  const requestAndResponse = requestAndResponseToString(
    error.config ?? null,
    error.response ?? null,
  );
  if (errorMessage && typeof errorMessage === "string") {
    return requestAndResponse
      ? `${errorMessage}\n\n${requestAndResponse}`
      : errorMessage;
  }
  return requestAndResponse;
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
