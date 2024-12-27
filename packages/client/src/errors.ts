import {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  isAxiosError,
} from "axios";

export const maybeEnrichAxiosError = <T = unknown>(error: T): T => {
  if (isAxiosError(error)) {
    return enrichAxiosError(error) as T;
  }
  return error;
};

const enrichAxiosError = (error: AxiosError) => {
  const errorMessage = (error.response?.data as { message?: unknown } | null)
    ?.message;
  const requestAndResponse = requestAndResponseToString(
    error.config ?? null,
    error.response ?? null
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

  return new AxiosError(
    error.message ? message + "\n\n" + error.message : message,
    error.code,
    error.config,
    error.request,
    error.response
  );
};

const requestAndResponseToString = (
  request: InternalAxiosRequestConfig<any> | null,
  response: AxiosResponse | null
) => {
  if (!request || !request.url || !request.method) {
    return "";
  }
  if (response == null) {
    return `${requestToString(request)}`;
  }
  return `${requestToString(request)} returned ${responseToString(response)})`;
};

const requestToString = (
  request: Pick<AxiosRequestConfig, "method" | "url">
) => {
  return `${request.method} ${request.url}`;
};

const responseToString = (response: AxiosResponse) => {
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
