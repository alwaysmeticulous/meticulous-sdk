import { Browser, JSHandle, Page } from "puppeteer";
import { startServer } from "@alwaysmeticulous/replay-debugger-ui";

export interface ReplayableEvent {
  [key: string]: any;
}

export interface ReplayDebuggerState<T = ReplayableEvent> {
  events: T[];
  index: number;
  loading: boolean;
}

export interface ReplayDebuggerUIOptions<T = ReplayableEvent> {
  browser: Browser;
  replayedPage: Page;
  replayableEvents: T[];
  moveBeforeClick: boolean;
}

export interface ReplayDebuggerUI {
  page: Page;
}

export const createReplayDebuggerUI: <T = ReplayableEvent>(
  options: ReplayDebuggerUIOptions<T>
) => Promise<ReplayDebuggerUI> = async ({
  browser,
  replayedPage,
  replayableEvents,
  moveBeforeClick,
}) => {
  type T = typeof replayableEvents[0];

  // Start the UI server
  const uiServer = await startServer();

  // Create page for the debugger UI
  const debuggerPage = await browser.defaultBrowserContext().newPage();
  debuggerPage.setViewport({
    width: 0,
    height: 0,
  });

  const state: ReplayDebuggerState<T> = {
    events: replayableEvents,
    index: 0,
    loading: false,
  };

  // Bind replay function findEventTarget()
  const findEventTarget = async (event: T) => {
    const target = await replayedPage.evaluateHandle((event) => {
      const target = (
        window as any
      ).__meticulous.replayFunctions.findEventTarget(event);
      return target;
    }, event as any);
    return target;
  };

  // Bind replay function simulateEvent()
  const simulateEvent = async ({
    event,
    target,
  }: {
    event: T;
    target: JSHandle;
  }) => {
    await replayedPage.evaluate(
      (event, target) => {
        (window as any).__meticulous.replayFunctions.simulateEvent({
          event,
          target,
        });
      },
      event as any,
      target.asElement()
    );
  };

  // Bind UI function setState()
  const setState = async () => {
    await debuggerPage.evaluate((state) => {
      (window as any).__meticulous__replayDebuggerSetState(state);
    }, state as any);
  };

  const onReady = async () => {
    await setState();
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

  const onPlayNextEvent = async () => {
    if (state.index >= replayableEvents.length) {
      console.log("End of replay!");
      return;
    }

    state.loading = true;
    await setState();

    try {
      const nextEvent = state.events[state.index];

      if (moveBeforeClick) {
        const { x, y, type: eventType } = nextEvent as any;
        if (
          (eventType === "click" ||
            eventType === "mouseup" ||
            eventType === "mousedown") &&
          typeof x === "number" &&
          typeof y === "number"
        ) {
          await replayedPage.mouse.move(x, y);
        }
      }

      const target = await findEventTarget(nextEvent);
      const targetExists = await target.evaluate((target) => !!target);
      console.log(
        `[Event #${state.index}] ${
          targetExists ? "Target found" : "Target not found"
        }`
      );
      await simulateEvent({ event: nextEvent, target });
    } catch (error) {
      console.error(error);
    } finally {
      ++state.index;
      state.loading = false;
      setState();
    }
  };

  const onSetIndex = async ({ index }: { index: number }) => {
    state.index = Math.max(0, Math.min(state.events.length - 1, index));
    setState();
  };

  // Bind UI function dispatchEvent()
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
        return onSetIndex({ index: data.index || 0 });
      }
      console.log(`Warning: received unknown event "${eventType}"`);
    }
  );

  const url = "http://localhost:3005/";
  console.log(`Navigating to ${url}...`);
  const res = await debuggerPage.goto(url, {
    waitUntil: "domcontentloaded",
  });
  const status = res.status();
  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site. Got a ${status} instead.`
    );
  }
  console.log(`Navigated to ${url}`);

  debuggerPage.on("close", () => {
    uiServer.close();
  });

  return {
    page: debuggerPage,
  };
};
