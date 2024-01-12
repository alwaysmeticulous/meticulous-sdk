import { Page } from "puppeteer";

export interface BaseMeticulousConfig {
  sessionId: string;
}
export const exposeNewRecordingCallback = async <
  T extends BaseMeticulousConfig
>(
  page: Page,
  callback: (config: T) => void
) => {
  await page.exposeFunction("__meticulous_onBeginRecording", callback);
};
