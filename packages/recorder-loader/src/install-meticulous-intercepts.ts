import { SNIPPETS_BASE_URL } from "./constants";
import { getSnippetVersionFolder } from "./get-snippet-version-folder";
import { Recorder, tryLoadAndStartRecorder } from "./loader";
import { LoaderOptions } from "./loader.types";
import { PrivateWindowApi } from "./private-window-api";

export interface Interceptor {
  startRecordingSession: (options: LoaderOptions) => Promise<Recorder>;
  stopIntercepting: () => Promise<void>;
}

export interface InterceptorOptions {
  /**
   * If it takes more than the specified number of 'ms' to load the interceptor,
   * then the promise returned by tryInstallMeticulousIntercepts will return
   * immediately (thereby unblocking the load of the application, but preventing
   * Meticulous from recording a correct session, with all required network mocks).
   *
   * Defaults to 2000ms.
   */
  maxMsToBlockFor?: number;

  /**
   * Load a specific fixed version of the snippet. If not set will load the
   * latest minor/patch version of the recorder. Bumping to a new major
   * version requires a bump of your @alwaysmeticulous/recorder-loader
   * dependency.
   *
   * Recommendation: leave this unset
   */
  version?: string;
}

const DEFAULT_MAX_MS_TO_BLOCK_FOR = 2000;

/**
 * Stores a copy of network requests and responses in memory, but doesn't send them to the
 * server, until the the main recorder is initialised.
 *
 * This is useful if you only want to record sessions for certain users with certain attributes. In
 * this case you have an issue: you need to wait for the user information to load before you know whether
 * you can enable the recorder, but if you enable the recorder after the user information has loaded
 * then the recorder won't be able to capture the initial request & response to load the user information,
 * or other early network responses.
 *
 * The early network recorder solves this: load the early network recorder for all sessions,
 * but only load the main recorder for sessions that you want to record. If when you load the user data
 * you find out you don't want to record the session then you can call the stopRecording() method returned
 * by this method.
 *
 * Example usage:
 *
 * ```
 * // The below call should happen before your app makes any network requests,
 * // or executes any methods that may store a reference to window.fetch or XMLHttpRequest.
 * const interceptor = await tryInstallMeticulousIntercepts();
 *
 * // Later, when you have loaded user data...
 * const userData = await loadUserInfo();
 * if (shouldRecord(userData)) {
 *  await interceptor.startRecordingSession({ ... });
 * } else {
 *  interceptor.stopIntercepting();
 * }
 * ```
 */
export const tryInstallMeticulousIntercepts = async (
  options: InterceptorOptions
): Promise<Interceptor> => {
  let requestedToStopIntercepting = false;
  let disposedEarlyNetworkRecorder = false;
  const stopIntercepting = async () => {
    requestedToStopIntercepting = true;
    const disposeFunction = (window as PrivateWindowApi)?.__meticulous
      ?.earlyNetworkRecorder?.dispose;
    if (disposeFunction && !disposedEarlyNetworkRecorder) {
      await disposeFunction();
      disposedEarlyNetworkRecorder = true;
    }
  };
  const interceptor = {
    startRecordingSession: tryLoadAndStartRecorder,
    stopIntercepting,
  };

  const maxMsToBlockFor =
    options.maxMsToBlockFor ?? DEFAULT_MAX_MS_TO_BLOCK_FOR;
  const promise = new Promise<Interceptor>((resolve, reject) => {
    const timeout =
      maxMsToBlockFor > 0
        ? setTimeout(() => {
            resolve(interceptor);
          }, maxMsToBlockFor)
        : null;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `${SNIPPETS_BASE_URL}/record/${getSnippetVersionFolder(
      options.version ?? null
    )}/network-recorder.bundle.js`;

    script.onload = function () {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      resolve(interceptor);
    };
    script.onerror = () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      reject("Meticulous early network recorder failed to initialise.");
    };

    document.head.appendChild(script);
  });

  // Try to load the early network recorder and silence any initialisation error.
  return promise
    .catch((error) => {
      console.error(error);
      return interceptor;
    })
    .finally(() => {
      if (requestedToStopIntercepting) {
        void stopIntercepting();
      }
    });
};
