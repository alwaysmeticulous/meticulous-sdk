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
  recordingSnippetManualInit,
  uploadIntervalMs,
  captureHttpOnlyCookies,
  recordingSource = "cli",
}: {
  page: Page;
  recordingToken: string;
  appCommitHash: string;
  recordingSnippetManualInit: string;
  uploadIntervalMs: number | null;
  captureHttpOnlyCookies: boolean;
  recordingSource?: string;
}): Promise<void> {
  const recordingSnippetFile = await readFile(
    recordingSnippetManualInit,
    "utf8"
  );

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
  await page.evaluateOnNewDocument(recordingSnippetFile);
  await page.evaluateOnNewDocument(
    (forbiddenUrls) => {
      // We only record in the root frame (not in sub-iframes), and we don't record on the built in start pages
      if (
        window === window.parent &&
        !forbiddenUrls.includes(window.document.location.toString())
      ) {
        const initRecorder = (window as MeticulousRecorderWindow).__meticulous
          ?.initialiseRecorder;
        if (!initRecorder) {
          throw new Error(
            "window.__meticulous.initialiseRecorder is null or undefined: cannot record session on page"
          );
        }
        initRecorder();
      }
    },
    [
      INITIAL_METICULOUS_RECORD_DOCS_URL,
      INITIAL_METICULOUS_RECORD_LOGIN_FLOW_DOCS_URL,
      METICULOUS_RECORD_LOGIN_FLOW_SAVING_DOCS_URL,
    ]
  );

  if (captureHttpOnlyCookies) {
    await provideCookieAccess(page);
  }
}
