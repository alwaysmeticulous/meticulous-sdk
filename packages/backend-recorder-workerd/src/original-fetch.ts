type FetchFn = typeof globalThis.fetch;

let originalFetch: FetchFn | undefined;

/**
 * Holds the pre-patch `globalThis.fetch`. Its own module so that both the fetch patch (which
 * captures it) and the capture tee (which uses it to reach the sidecar) can reach it without
 * importing each other.
 */
export const setOriginalFetch = (fetchFn: FetchFn): void => {
  originalFetch = fetchFn;
};

/**
 * The unpatched fetch — used for the shim's own sidecar requests, so they are never
 * themselves captured. Falls back to the current global before the patch is installed.
 */
export const getOriginalFetch = (): FetchFn =>
  originalFetch ?? globalThis.fetch;
