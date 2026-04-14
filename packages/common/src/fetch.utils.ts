import { getErrorCode } from "./error-code.utils";

interface CreateMeticulousFetchOptions<TInput, TInit, TResponse> {
  createFallbackInit?: (init?: TInit) => TInit;
  getFallbackFetch: () => Promise<(
    input: TInput,
    init?: TInit,
  ) => Promise<TResponse>>;
}

export const createMeticulousFetch = <TInput, TInit, TResponse>({
  createFallbackInit,
  getFallbackFetch,
}: CreateMeticulousFetchOptions<TInput, TInit, TResponse>) => {
  return async (
    input: TInput,
    init?: TInit,
  ): Promise<TResponse> => {
    if (shouldUseNativeFetch()) {
      try {
        return await globalThis.fetch(
          input as Parameters<typeof globalThis.fetch>[0],
          init as Parameters<typeof globalThis.fetch>[1],
        ) as TResponse;
      } catch (error) {
        throw normalizeFetchError(error);
      }
    }

    const fallbackInit = createFallbackInit ? createFallbackInit(init) : init;
    const fallbackFetch = await getFallbackFetch();
    return await fallbackFetch(input, fallbackInit);
  };
};

function shouldUseNativeFetch() {
  return !hasProxyConfiguration() && typeof globalThis.fetch === "function";
}

function hasProxyConfiguration() {
  return PROXY_ENVIRONMENT_VARIABLES.some((environmentVariable) => {
    return Boolean(process.env[environmentVariable]);
  });
}

function normalizeFetchError<T>(error: T): T {
  if (!error || typeof error !== "object") {
    return error;
  }

  const fetchError = error as unknown as Error & {
    cause?: unknown;
    code?: string;
  };
  if (fetchError.code) {
    return error;
  }

  const causeCode = getErrorCode(fetchError.cause);
  if (causeCode) {
    fetchError.code = causeCode;
  }

  return error;
}
const PROXY_ENVIRONMENT_VARIABLES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;
