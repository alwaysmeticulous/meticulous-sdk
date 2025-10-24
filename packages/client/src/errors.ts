export interface FetchError extends Error {
  response?: {
    status: number;
    statusText: string;
    data: any;
    headers: Record<string, string>;
  } | undefined;
  config?: {
    url: string;
    method?: string;
  } | undefined;
}

export const isFetchError = (error: any): error is FetchError => {
  return error && typeof error === "object" && error.response;
};

export const maybeEnrichFetchError = <T = unknown>(error: T): T => {
  if (isFetchError(error)) {
    return enrichFetchError(error) as T;
  }
  return error;
};

const enrichFetchError = (error: FetchError) => {
  const errorMessage = (error.response?.data as { message?: unknown } | null)
    ?.message;
  const requestAndResponse = requestAndResponseToString(
    error.config ?? null,
    error.response ?? null,
  );
  let message = "";
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

const requestToString = (
  request: { method?: string; url: string },
) => {
  return `${request.method?.toUpperCase()}${request.method ? " " : ""}${
    request.url
  }`;
};

const responseToString = (response: { status: number; statusText: string; data: any }) => {
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
    return data + "";
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
