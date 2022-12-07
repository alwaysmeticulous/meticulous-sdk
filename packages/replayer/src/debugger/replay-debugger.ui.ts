import { ReplayableEvent } from "@alwaysmeticulous/api";
import { startServer } from "@alwaysmeticulous/replay-debugger-ui";
import { BeforeUserEventOptions } from "@alwaysmeticulous/sdk-bundles-api";
import { Browser, Page } from "puppeteer";

export interface ReplayDebuggerState {
  events: ReplayableEvent[];
  index: number;
  loading: boolean;
}

export interface ReplayDebuggerUIOptions {
  browser: Browser;
  replayedPage: Page;
  replayableEvents: ReplayableEvent[];
}

export interface ReplayDebuggerUI {
  page: Page;
}

type OnBeforeUserEventCallback = (
  options: BeforeUserEventOptions
) => Promise<void>;

export const openStepThroughDebuggerUI = async ({
  browser,
  replayedPage,
  replayableEvents,
}: ReplayDebuggerUIOptions): Promise<OnBeforeUserEventCallback> => {
  // Start the UI server
  const uiServer = await startServer();

  // Create page for the debugger UI
  const debuggerPage = await browser.defaultBrowserContext().newPage();
  debuggerPage.setViewport({
    width: 0,
    height: 0,
  });

  /**
   * The index the page is in the process of advancing to. Equal to the current index
   * if the page has already replayed all the so-far-requested user events.
   */
  let targetIndex = 0;
  const state: ReplayDebuggerState = {
    events: replayableEvents,
    index: 0,
    loading: false,
  };

  const setState = async () => {
    await debuggerPage.evaluate((state) => {
      (window as any).__meticulous__replayDebuggerSetState(state);
    }, state as any);
  };

  const onReady = async () => {
    await setState();
  };

  let advanceToNextEvent: (() => void) | null = null;
  const onBeforeNextEvent = ({ userEventIndex }: BeforeUserEventOptions) => {
    state.loading = userEventIndex < targetIndex;
    state.index = Math.max(
      0,
      Math.min(state.events.length - 1, userEventIndex)
    );

    if (state.index < targetIndex) {
      return Promise.resolve(); // keep going
    }

    return new Promise<void>((resolve) => {
      advanceToNextEvent = resolve;
    });
  };

  const onPlayNextEvent = async () => {
    targetIndex = state.index + 1;
    state.loading = true;
    await setState();
    advanceToNextEvent?.();
  };

  const onAdvanceToIndex = (newTargetIndex: number) => {
    if (newTargetIndex <= state.index) {
      return; // Do nothing
    }
    targetIndex = newTargetIndex;
    state.loading = true;
    advanceToNextEvent?.();
  };

  const findEventTarget = async (event: ReplayableEvent) => {
    const target = await replayedPage.evaluateHandle((event) => {
      const target = (
        window as any
      ).__meticulous.replayFunctions.findEventTarget(event);
      return target;
    }, event as any);
    return target;
  };

  const onCheckNextTarget = async () => {
    if (state.index >= replayableEvents.length) {
      console.log("End of replay!");
      return;
    }

    const nextEvent = state.events[state.index];
    const target = await findEventTarget(nextEvent);
    const targetExists = await target.evaluate((target) => !!target);
    console.log(
      `[Event #${state.index}] ${
        targetExists ? "Target found" : "Target not found"
      }`
    );
    await replayedPage.evaluate((target) => {
      console.log("Next event target:");
      console.log(target);
    }, target);
  };

  // This function is called by the UI itself
  await debuggerPage.exposeFunction(
    "__meticulous__replayDebuggerDispatchEvent",
    (eventType: string, data: any) => {
      if (eventType === "ready") {
        return onReady();
      }
      if (eventType === "check-next-target") {
        return onCheckNextTarget();
      }
      if (eventType === "play-next-event") {
        return onPlayNextEvent();
      }
      if (eventType === "set-index") {
        return onAdvanceToIndex(data.index || 0);
      }
      console.log(`Warning: received unknown event "${eventType}"`);
    }
  );

  const url = "http://localhost:3005/";
  console.log(`Navigating to ${url}...`);
  const res = await debuggerPage.goto(url, {
    waitUntil: "domcontentloaded",
  });
  const status = res && res.status();
  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site. Got a ${status} instead.`
    );
  }
  console.log(`Navigated to ${url}`);

  debuggerPage.on("close", () => {
    uiServer.close();
  });

  // Close all pages if one of them is closed
  replayedPage.on("close", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    debuggerPage.close().catch(() => {});
  });
  debuggerPage.on("close", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    replayedPage.close().catch(() => {});
  });

  return onBeforeNextEvent;
};
