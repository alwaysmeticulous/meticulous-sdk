import { readFile } from "fs/promises";
import { Page } from "puppeteer";
import {
  INITIAL_METICULOUS_RECORD_DOCS_URL,
  INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
  METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
} from "./constants";
import { provideCookieAccess } from "./utils/provide-cookie-access";

interface MeticulousRecorderWindow {
  METICULOUS_RECORDING_TOKEN?: string;
  METICULOUS_APP_COMMIT_HASH?: string;
  METICULOUS_FORCE_RECORDING?: boolean;
  METICULOUS_RECORDING_SOURCE?: string;
  METICULOUS_UPLOAD_INTERVAL_MS?: number;
  METICULOUS_ENABLE_RRWEB_PLUGIN_NODE_DATA?: boolean;

  __meticulous?: {
    initialiseRecorder?: () => void;
  };
}

// Setup Meticulous recording
export async function bootstrapPage({
  page,
  recordingToken,
  appCommitHash,
  recordingSnippetUrl,
  uploadIntervalMs,
  captureHttpOnlyCookies,
  recordingSource = "cli",
}: {
  page: Page;
  recordingToken: string;
  appCommitHash: string;
  recordingSnippetUrl: string;
  uploadIntervalMs: number | null;
  captureHttpOnlyCookies: boolean;
  recordingSource?: string;
}): Promise<void> {
  // const recordingSnippetFile = await readFile(
  //   recordingSnippetManualInit,
  //   "utf8"
  // );

  await page.evaluateOnNewDocument(
    ({ recordingToken, appCommitHash, recordingSource, uploadIntervalMs }) => {
      const recorderWindow = window as MeticulousRecorderWindow;
      recorderWindow["METICULOUS_RECORDING_TOKEN"] = recordingToken;
      recorderWindow["METICULOUS_APP_COMMIT_HASH"] = appCommitHash;
      recorderWindow["METICULOUS_FORCE_RECORDING"] = true;
      recorderWindow["METICULOUS_RECORDING_SOURCE"] = recordingSource;
      recorderWindow["METICULOUS_ENABLE_RRWEB_PLUGIN_NODE_DATA"] = true;

      if (uploadIntervalMs != null) {
        recorderWindow["METICULOUS_UPLOAD_INTERVAL_MS"] = uploadIntervalMs;
      }
    },
    { recordingToken, appCommitHash, recordingSource, uploadIntervalMs }
  );

  // await page.evaluateOnNewDocument(recordingSnippetFile);
  if (captureHttpOnlyCookies) {
    await provideCookieAccess(page);
  }
  await page.evaluateOnNewDocument(
    (forbiddenUrls, recordingSnippetUrl) => {
      const installRecorder = () => {
        /**
         * The recorder crashes if it tries to initialize on a chrome-error page
         * (Chrome e.g. uses this page for HTTP basic auth popups before the user has authenticated)
         *
         * This is because the recorder tries inserting an iframe into the head, and this crashes Chrome
         * if done on a chrome-error page.
         */
        const FORBIDDEN_PROTOCOLS = ["chrome://", "chrome-error://"];

        const url = window.document.location.toString();

        // We only record in the root frame (not in sub-iframes), and we don't record on the built in start pages,
        // or on chrome:// and chrome-error:// pages
        if (
          window !== window.parent ||
          forbiddenUrls.includes(url) ||
          FORBIDDEN_PROTOCOLS.some((protocol) => url.startsWith(protocol))
        ) {
          return;
        }

        const script = document.createElement("script");
        script.type = "text/javascript";
        script.src = recordingSnippetUrl;
        document.head.insertBefore(script, document.head.firstChild);
        script.onerror = () => {
          console.error(
            "Failed to load the Meticulous recorder snippet. This could be related to your site CSP policy, if so you can use the bypassCSP option to bypass it."
          );
        };
      };
      if (document.head) {
        installRecorder();
      } else {
        document.addEventListener("DOMContentLoaded", installRecorder);
      }
    },
    [
      INITIAL_METICULOUS_RECORD_DOCS_URL,
      INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
      METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
    ],
    recordingSnippetUrl
  );
}
