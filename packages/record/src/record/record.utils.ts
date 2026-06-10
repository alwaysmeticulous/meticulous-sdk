import { readFile } from "fs/promises";
import { Page } from "puppeteer-core";
import {
  METICULOUS_BYPASS_CSP_DOCS_URL,
  REQUIRED_CSP_ORIGINS,
} from "./constants";
import { getRecordingSnippetUrl } from "./get-recording-snippet-url";
import { provideCookieAccess } from "./utils/provide-cookie-access";
import { wrapInShouldRecordCondition } from "./utils/wrap-in-should-record-condition";

interface MeticulousRecorderWindow {
  METICULOUS_RECORDING_TOKEN?: string;
  METICULOUS_APP_COMMIT_HASH?: string;
  METICULOUS_FORCE_RECORDING?: boolean;
  METICULOUS_RECORDING_SOURCE?: string;
  METICULOUS_UPLOAD_INTERVAL_MS?: number;
  METICULOUS_ENABLE_RRWEB_PLUGIN_NODE_DATA?: boolean;
  METICULOUS_REDACT_PASSWORDS?: boolean;

  __meticulous?: {
    initialiseRecorder?: () => void;
    snippetScriptSrc?: string;
    sendWorkerBootstrapToAllWorkers?: () => void;
  };
}

// Setup Meticulous recording
export async function bootstrapPage({
  page,
  recordingToken,
  appCommitHash,
  recordingSnippet,
  workerRecordingSnippet,
  uploadIntervalMs,
  captureHttpOnlyCookies,
  recordingSource = "cli",
  disablePasswordRedaction,
}: {
  page: Page;
  recordingToken: string;
  appCommitHash: string;
  recordingSnippet: string;
  workerRecordingSnippet: string;
  uploadIntervalMs: number | null;
  captureHttpOnlyCookies: boolean;
  recordingSource?: string;
  disablePasswordRedaction?: boolean;
}): Promise<void> {
  const recordingSnippetFile = await readFile(recordingSnippet, "utf8");
  const snippetScriptUrl = getRecordingSnippetUrl();

  await page.evaluateOnNewDocument(
    ({
      recordingToken,
      appCommitHash,
      recordingSource,
      uploadIntervalMs,
      disablePasswordRedaction,
      snippetScriptUrl,
    }) => {
      const recorderWindow = window as MeticulousRecorderWindow;
      recorderWindow.__meticulous = recorderWindow.__meticulous || {};
      recorderWindow.__meticulous.snippetScriptSrc ??= snippetScriptUrl;
      recorderWindow["METICULOUS_RECORDING_TOKEN"] = recordingToken;
      recorderWindow["METICULOUS_APP_COMMIT_HASH"] = appCommitHash;
      recorderWindow["METICULOUS_FORCE_RECORDING"] = true;
      recorderWindow["METICULOUS_RECORDING_SOURCE"] = recordingSource;
      recorderWindow["METICULOUS_ENABLE_RRWEB_PLUGIN_NODE_DATA"] = true;

      if (uploadIntervalMs != null) {
        recorderWindow["METICULOUS_UPLOAD_INTERVAL_MS"] = uploadIntervalMs;
      }
      if (disablePasswordRedaction) {
        recorderWindow["METICULOUS_REDACT_PASSWORDS"] = false;
      }
    },
    {
      recordingToken,
      appCommitHash,
      recordingSource,
      uploadIntervalMs,
      disablePasswordRedaction,
      snippetScriptUrl,
    }
  );

  if (captureHttpOnlyCookies) {
    await provideCookieAccess(page);
  }

  const workerBundleSource = await readFile(workerRecordingSnippet, "utf8");
  page.on("workercreated", (worker) => {
    void (async () => {
      await worker.evaluate((src: string) => {
        (0, eval)(src);
      }, workerBundleSource);
      await page.evaluate(() => {
        const recorderWindow = window as MeticulousRecorderWindow;
        recorderWindow.__meticulous?.sendWorkerBootstrapToAllWorkers?.();
      });
    })();
  });

  await page.evaluateOnNewDocument(
    wrapInShouldRecordCondition(recordingSnippetFile)
  );

  await page.evaluateOnNewDocument(
    (requiredOrigins, docsPage) => {
      if (window.parent !== window) {
        return; // Only the top frame should trigger the bypass-CSP redirect; child frames must not navigate the whole tab.
      }
      addEventListener("securitypolicyviolation", (event) => {
        if (
          requiredOrigins.some((origin) => event.blockedURI.startsWith(origin))
        ) {
          window.location.href = docsPage;
        }
      });
    },
    REQUIRED_CSP_ORIGINS,
    METICULOUS_BYPASS_CSP_DOCS_URL
  );
}
