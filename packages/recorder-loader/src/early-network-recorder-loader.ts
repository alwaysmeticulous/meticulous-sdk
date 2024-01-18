import { SNIPPET_BASE_URL } from "./constants";

interface EarlyNetworkRecorderWindow {
  __meticulous?: {
    earlyNetworkRecorder?: {
      stop?: () => void;
    };
  };
}

/**
 * Stores a copy of network requests and responses in memory, but doesn't send them to the
 * server, until the the main recorder (loaded by {@link tryLoadAndStartRecorder}) is initialised.
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
 */
export const tryLoadAndStartEarlyNetworkRecorder = async (
  options: { maxMsToBlockFor: number } = { maxMsToBlockFor: 2000 }
) => {
  let requestedToStopRecording = false;
  let stoppedRecording = false;
  const stopRecording = () => {
    requestedToStopRecording = true;
    const stopFunction = (window as EarlyNetworkRecorderWindow)?.__meticulous
      ?.earlyNetworkRecorder?.stop;
    if (stopFunction && !stoppedRecording) {
      stopFunction();
      stoppedRecording = true;
    }
  };

  const promise = new Promise<{ stopRecording: () => void }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({ stopRecording });
      }, options.maxMsToBlockFor);

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = `${SNIPPET_BASE_URL}/record/v1/network-recorder.bundle.js`;

      script.onload = function () {
        window.clearTimeout(timeout);
        resolve({ stopRecording });
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject("Meticulous early network recorder failed to initialise.");
      };

      document.head.appendChild(script);
    }
  );

  // Try to load the early network recorder and silence any initialisation error.
  await promise
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      if (requestedToStopRecording) {
        stopRecording();
      }
    });
};
