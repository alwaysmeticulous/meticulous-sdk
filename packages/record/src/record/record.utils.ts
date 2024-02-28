import { readFile } from "fs/promises";
import { Page } from "puppeteer";
import { provideCookieAccess } from "./utils/provide-cookie-access";
import { wrapInShouldRecordCondition } from "./utils/wrap-in-should-record-condition";

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
  recordingSnippet,
  uploadIntervalMs,
  captureHttpOnlyCookies,
  recordingSource = "cli",
}: {
  page: Page;
  recordingToken: string;
  appCommitHash: string;
  recordingSnippet: string;
  uploadIntervalMs: number | null;
  captureHttpOnlyCookies: boolean;
  recordingSource?: string;
}): Promise<void> {
  const recordingSnippetFile = await readFile(recordingSnippet, "utf8");

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

  if (captureHttpOnlyCookies) {
    await provideCookieAccess(page);
  }

  await page.evaluateOnNewDocument(
    wrapInShouldRecordCondition(recordingSnippetFile)
  );
}
