import { SNIPPETS_BASE_URL } from "./constants";
import { getSnippetVersionFolder } from "./get-snippet-version-folder";
import { LoaderOptions } from "./loader.types";
import { PrivateWindowApi } from "./private-window-api";

const DEFAULT_MAX_MS_TO_BLOCK_FOR = 2_000;

export interface Recorder {
  /**
   * Disables the recorder for the rest of the user session, and stops sending data to the Meticulous
   * servers.
   *
   * Once this method is called the recorder cannot be restarted (unless the page is reloaded).
   */
  stopRecording: () => Promise<void>;
}

/**
 * Load and start the Meticulous Recorder
 */
export const tryLoadAndStartRecorder = async (
  options: LoaderOptions,
): Promise<Recorder> => {
  if (window.Meticulous?.isRunningAsTest) {
    console.debug(
      "Running as part of a Meticulous test case, so skipping loading the Meticulous recorder.",
    );
    return {
      stopRecording: async () => {
        // No op
      },
    };
  }

  // Try to load the recorder and silence any initialisation error.
  return await unsafeLoadAndStartRecorder(options).catch((error) => {
    console.error(error);
    return {
      stopRecording: async () => {
        // No op
      },
    };
  });
};

const unsafeLoadAndStartRecorder = ({
  projectId,
  recordingToken,
  uploadIntervalMs,
  snapshotLinkedStylesheets,
  commitHash,
  maxMsToBlockFor: maxMsToBlockFor_,
  snippetsBaseUrl,
  forceRecording,
  middleware,
  responseSanitizers,
  isProduction,
  version,
  integrity,
}: LoaderOptions): Promise<Recorder> => {
  let abandoned = false;

  return new Promise<Recorder>((resolve, reject) => {
    const maxMsToBlockFor = maxMsToBlockFor_ ?? DEFAULT_MAX_MS_TO_BLOCK_FOR;

    if (maxMsToBlockFor > 0) {
      setTimeout(() => {
        abandoned = true;
        resolve({
          stopRecording: async () => {
            // No op: we never started recording
          },
        });
      }, maxMsToBlockFor);
    }

    const script = document.createElement("script");
    script.type = "text/javascript";
    const baseSnippetsUrl = snippetsBaseUrl || SNIPPETS_BASE_URL;
    script.src = new URL(
      `${version != null ? "record/" : ""}${getSnippetVersionFolder(
        version ?? null,
      )}/meticulous-manual-init.js`,
      baseSnippetsUrl,
    ).href;

    // Set integrity attribute for subresource integrity verification if version and integrity are provided
    if (version != null && integrity != null) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }

    // Setup configuration
    const typedWindow = window;
    typedWindow.METICULOUS_RECORDING_TOKEN = recordingToken ?? projectId;

    if (uploadIntervalMs !== undefined) {
      typedWindow.METICULOUS_UPLOAD_INTERVAL_MS = uploadIntervalMs;
    }

    if (commitHash !== undefined) {
      typedWindow.METICULOUS_APP_COMMIT_HASH = commitHash;
    }

    if (snapshotLinkedStylesheets !== undefined) {
      typedWindow.METICULOUS_SNAPSHOT_LINKED_STYLESHEETS =
        snapshotLinkedStylesheets;
    }

    if (forceRecording !== undefined) {
      typedWindow.METICULOUS_FORCE_RECORDING = forceRecording;
    }

    if (isProduction !== undefined) {
      typedWindow.METICULOUS_IS_PRODUCTION_ENVIRONMENT = isProduction;
    }

    if (responseSanitizers != null && responseSanitizers.length > 0) {
      typedWindow.METICULOUS_NETWORK_RESPONSE_SANITIZERS = responseSanitizers;
    }

    if (middleware != null && middleware.length > 0) {
      typedWindow.METICULOUS_RECORDER_MIDDLEWARE_V1 = middleware;
    }

    script.onload = function () {
      if (abandoned) {
        console.debug(
          "Meticulous snippet abandoned due to max blocking time reached.",
        );
        // At this point the promise has already resolved.
        return;
      }

      const initialiseRecorder = (window as PrivateWindowApi).__meticulous
        ?.initialiseRecorder;
      if (typeof initialiseRecorder !== "function") {
        reject("Meticulous recorder failed to initialise.");
        return;
      }

      try {
        initialiseRecorder();
      } catch (error) {
        reject(error);
      }

      resolve({
        stopRecording: async () => {
          const stopRecording = (window as PrivateWindowApi).__meticulous
            ?.stopRecording;
          if (!stopRecording) {
            throw new Error(
              "Recorder not initialised: window.__meticulous.stopRecording is not defined.",
            );
          }
          await stopRecording();
          return;
        },
      });
    };
    script.onerror = () => {
      reject("Meticulous recorder failed to initialise.");
    };

    document.head.appendChild(script);
  });
};

/**
 * @deprecated Use `tryLoadAndStartRecorder` instead.
 *
 * Load and start the Meticulous Recorder
 */
export const loadAndStartRecorder = unsafeLoadAndStartRecorder;
