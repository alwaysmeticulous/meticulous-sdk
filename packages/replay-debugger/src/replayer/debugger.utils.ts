import { readFile } from "fs/promises";
import type {
  BaseReplayEventsDependencies,
  ReplayEventsDependency,
} from "@alwaysmeticulous/common";
import { patchDate } from "@alwaysmeticulous/replayer";
import { Page } from "puppeteer";

export interface SetupPageCookiesOptions {
  page: Page;
  cookiesFile: string;
}

export const setupPageCookies: (
  options: SetupPageCookiesOptions
) => Promise<void> = async ({ page, cookiesFile }) => {
  const cookiesStr = await readFile(cookiesFile, "utf-8");
  const cookies = JSON.parse(cookiesStr) as any[];
  await page.setCookie(...cookies);
};

export interface ReplayDebuggerDependencies
  extends BaseReplayEventsDependencies {
  replayDebugger: ReplayEventsDependency<"replayDebugger">;
  reanimator: ReplayEventsDependency<"reanimator">;
  replayNetworkFile: ReplayEventsDependency<"replayNetworkFile">;
}

export interface BootstrapPageOptions {
  page: Page;
  sessionData: any;
  dependencies: ReplayDebuggerDependencies;
  shiftTime: boolean;
  networkStubbing: boolean;
}

export const bootstrapPage: (
  options: BootstrapPageOptions
) => Promise<void> = async ({
  page,
  sessionData,
  dependencies,
  shiftTime,
  networkStubbing,
}) => {
  // Shift simulation time by patching the Date class
  if (shiftTime) {
    await patchDate({ page, sessionData });
  }

  // Disable the recording snippet
  await page.evaluateOnNewDocument(`
    window["METICULOUS_DISABLED"] = true;
    window.__meticulous = window.__meticulous || {};
  `);

  await page.evaluateOnNewDocument(
    `window.sessionData = ${JSON.stringify(sessionData)}`
  );
  try {
    const { startUrl, startURL } = sessionData.userEvents.window;
    await page.evaluateOnNewDocument(
      `window.__meticulousStartURL = "${startUrl || startURL}"`
    );
    // TODO: fix this
    // eslint-disable-next-line no-empty
  } catch {}

  const reanimatorFile = await readFile(
    dependencies.reanimator.location,
    "utf8"
  );
  await page.evaluateOnNewDocument(reanimatorFile);

  await page.evaluateOnNewDocument(
    `window.Reanimator.replay(window['sessionData']['randomEvents'])`
  );

  if (networkStubbing) {
    const replayNetworkFile = await readFile(
      dependencies.replayNetworkFile.location,
      "utf-8"
    ); // Bundles PollyJS and supports the replay of network responses
    await page.evaluateOnNewDocument(replayNetworkFile);
    await page.evaluateOnNewDocument(`window.setUpPolly()`);
  }

  // Inject replay debug snippet
  await page.evaluateOnNewDocument(
    await readFile(dependencies.replayDebugger.location, "utf-8")
  );
};
