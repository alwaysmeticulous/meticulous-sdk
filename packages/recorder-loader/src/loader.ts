import { LoaderOptions } from "./loader.types";

const DEFAULT_MAX_MS_TO_BLOCK_FOR = 2000;

export const loadAndStartRecorder: (options: LoaderOptions) => Promise<void> = (
  options
) => {
  let abandoned = false;

  return new Promise<void>((resolve, reject) => {
    const maxMsToBlockFor =
      options.maxMsToBlockFor || DEFAULT_MAX_MS_TO_BLOCK_FOR;

    if (maxMsToBlockFor > 0) {
      setTimeout(() => {
        abandoned = true;
        resolve();
      }, maxMsToBlockFor);
    }

    const script = document.createElement("script");
    script.type = "text/javascript";
    const baseSnippetsUrl =
      options.snippetsBaseUrl || "https://snippet.meticulous.ai";
    script.src = new URL(
      "v1/stagingMeticulousSnippetManualInit.js",
      baseSnippetsUrl
    ).href;

    // Setup configuration
    window["METICULOUS_RECORDING_TOKEN"] = options.projectId;

    if (options.uploadIntervalMs) {
      window["METICULOUS_UPLOAD_INTERVAL_MS"] = options.uploadIntervalMs;
    }

    if (options.commitHash) {
      window["METICULOUS_APP_COMMIT_HASH"] = options.commitHash;
    }

    if (typeof options.snapshotLinkedStylesheets !== "undefined") {
      window["METICULOUS_SNAPSHOT_LINKED_STYLESHEETS"] =
        options.snapshotLinkedStylesheets;
    }

    script.onload = function () {
      if (abandoned) {
        console.debug(
          "Meticulous snippet abandoned due to max blocking time reached."
        );
        // At this point the promise has already resolved.
        return;
      }

      try {
        window.__meticulous?.initialiseRecorder();
      } catch (error) {
        reject(error);
      }

      resolve();
    };
    script.onerror = () => {
      reject("Meticulous recorder failed to initialise.");
    };

    document.head.appendChild(script);
  });
};
