import { ReplayableEvent } from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { BeforeUserEventOptions } from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
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

// openStepThroughDebuggerUI returns a OnBeforeUserEventCallback, which the replay code
// calls before each next event, and blocks on the returned promise. We use this to pause
// the execution until the user OKs it to continue to a certain event.
export const openStepThroughDebuggerUI = async ({
  browser,
  replayedPage,
  replayableEvents,
}: ReplayDebuggerUIOptions): Promise<OnBeforeUserEventCallback> => {
  // Start the UI server
  const uiServer = await startUiServer();

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
  let state: ReplayDebuggerState = {
    events: replayableEvents,
    index: 0,
    loading: false,
  };

  const setState = async (newState: Partial<ReplayDebuggerState>) => {
    state = { ...state, ...newState };
    await debuggerPage.evaluate((state) => {
      (window as any).__meticulous__replayDebuggerSetState(state);
    }, state as any);
  };

  const onReady = async () => {
    await setState(state);
  };

  let advanceToNextEvent: (() => void) | null = null;
  const onBeforeNextEvent = async ({
    userEventIndex,
  }: BeforeUserEventOptions) => {
    await setState({
      loading: userEventIndex < targetIndex,
      index: Math.max(0, Math.min(state.events.length - 1, userEventIndex)),
    });

    if (state.index < targetIndex) {
      advanceToNextEvent = null;
      return; // keep going
    }

    return new Promise<void>((resolve) => {
      advanceToNextEvent = resolve;
    });
  };

  const onPlayNextEvent = async () => {
    targetIndex = state.index + 1;
    await setState({ loading: true });
    advanceToNextEvent?.();
  };

  const onAdvanceToIndex = async (newTargetIndex: number) => {
    if (newTargetIndex <= state.index) {
      return; // Do nothing
    }
    targetIndex = newTargetIndex;
    await setState({ loading: true });
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

interface Server {
  close: () => void;
}

type StartServerFn = () => Server;

const startUiServer = async (): Promise<Server> => {
  try {
    const replayDebuggerUi =
      await require("@alwaysmeticulous/replay-debugger-ui");
    const startServerFn = replayDebuggerUi.startServer as StartServerFn;
    return startServerFn();
  } catch (error) {
    const logger = log.getLogger(METICULOUS_LOGGER_NAME);
    logger.error(
      "Error: could not import @alwaysmeticulous/replay-debugger-ui"
    );
    logger.error(error);
    logger.error("");
    logger.error(
      "Please make sure you've installed or added a dependency on '@alwaysmeticulous/replay-debugger-ui'. It is not installed automatically, and is required to use the '--debugger' flag."
    );
    throw error;
  }
};
