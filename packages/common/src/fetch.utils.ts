type FetchImplementation = (
  ...args: any[]
) => Promise<unknown>;

interface CreateMeticulousFetchOptions<TFetch extends FetchImplementation> {
  createFallbackInit?: (
    init?: Parameters<TFetch>[1],
  ) => Parameters<TFetch>[1];
  getFallbackFetch: () => TFetch;
}

export const createMeticulousFetch = <TFetch extends FetchImplementation>({
  createFallbackInit,
  getFallbackFetch,
}: CreateMeticulousFetchOptions<TFetch>) => {
  return async (
    input: Parameters<TFetch>[0],
    init?: Parameters<TFetch>[1],
  ): Promise<Awaited<ReturnType<TFetch>>> => {
    if (shouldUseNativeFetch()) {
      try {
        return await globalThis.fetch(
          input as Parameters<typeof globalThis.fetch>[0],
          init as Parameters<typeof globalThis.fetch>[1],
        ) as Awaited<ReturnType<TFetch>>;
      } catch (error) {
        throw normalizeFetchError(error);
      }
    }

    const fallbackInit = createFallbackInit ? createFallbackInit(init) : init;
    return await getFallbackFetch()(input, fallbackInit) as Awaited<
      ReturnType<TFetch>
    >;
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

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const nodeError = error as { code?: unknown };
  return typeof nodeError.code === "string" ? nodeError.code : undefined;
}

const PROXY_ENVIRONMENT_VARIABLES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;
