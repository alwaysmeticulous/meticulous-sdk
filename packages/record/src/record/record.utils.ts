import { readFile } from "fs/promises";
import { Page } from "puppeteer";

export interface IDeferred<T = void> {
  resolve: (value: T) => void;
  reject: () => void;
  promise: Promise<T>;
}

export function defer<T = void>(): IDeferred<T> {
  let resolve: (value: T) => void;
  let reject: () => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { resolve: resolve!, reject: reject!, promise };
}

// Setup Meticulous recording
export async function bootstrapPage({
  page,
  recordingToken,
  appCommitHash,
  recordingSnippet,
  uploadIntervalMs,
}: {
  page: Page;
  recordingToken: string;
  appCommitHash: string;
  recordingSnippet: string;
  uploadIntervalMs: number | null;
}): Promise<void> {
  const recordingSnippetFile = await readFile(recordingSnippet, "utf8");

  page.on("framenavigated", async (frame) => {
    if (page.mainFrame() === frame) {
      await frame.evaluate(`
        window["METICULOUS_RECORDING_TOKEN"] = "${recordingToken}";
        window["METICULOUS_APP_COMMIT_HASH"] = "${appCommitHash}";
        window["METICULOUS_FORCE_RECORDING"] = true;
        window["METICULOUS_UPLOAD_INTERVAL_MS"] = ${uploadIntervalMs};
      `);
      await frame.evaluate(recordingSnippetFile);
    }
  });
}
