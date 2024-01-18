import { SNIPPET_BASE_URL } from "./constants";
import { tryLoadAndStartRecorder } from "./loader";
import { LoaderOptions } from "./loader.types";

interface EarlyNetworkRecorderWindow {
  __meticulous?: {
    earlyNetworkRecorder?: {
      stop?: () => Promise<void>;
    };
  };
}

export interface Interceptor {
  startRecordingSession: (options: LoaderOptions) => Promise<void>;
  stopIntercepting: () => Promise<void>;
}

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
  options: { maxMsToBlockFor: number } = { maxMsToBlockFor: 2000 }
) => {
  let requestedToStopIntercepting = false;
  let stoppedRecording = false;
  const stopIntercepting = async () => {
    requestedToStopIntercepting = true;
    const stopFunction = (window as EarlyNetworkRecorderWindow)?.__meticulous
      ?.earlyNetworkRecorder?.stop;
    if (stopFunction && !stoppedRecording) {
      await stopFunction();
      stoppedRecording = true;
    }
  };
  const startRecordingSession = tryLoadAndStartRecorder;

  const promise = new Promise<Interceptor>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve({ startRecordingSession, stopIntercepting });
    }, options.maxMsToBlockFor);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `${SNIPPET_BASE_URL}/record/v1/network-recorder.bundle.js`;

    script.onload = function () {
      window.clearTimeout(timeout);
      resolve({ startRecordingSession, stopIntercepting });
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject("Meticulous early network recorder failed to initialise.");
    };

    document.head.appendChild(script);
  });

  // Try to load the early network recorder and silence any initialisation error.
  await promise
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      if (requestedToStopIntercepting) {
        stopIntercepting();
      }
    });
};
