import { ReplayableEvent } from "@alwaysmeticulous/api";
import { initLogger, ensureBrowser } from "@alwaysmeticulous/common";
import { startUIServer } from "@alwaysmeticulous/replay-debugger-ui";
import {
  BeforeUserEventOptions,
  BeforeUserEventResult,
} from "@alwaysmeticulous/sdk-bundles-api";
import { Browser, Page, launch } from "puppeteer-core";

export interface ReplayDebuggerState {
  events: ReplayableEvent[];
  index: number;
  loading: boolean;
}

export interface ReplayDebuggerUIOptions {
  onCloseReplayedPage: () => void;
  onLogEventTarget: (event: ReplayableEvent) => Promise<void>;
  replayableEvents: ReplayableEvent[];
  startAtEvent?: number;
}

export interface ReplayDebuggerUI {
  page: Page;
}

type OnBeforeUserEventCallback = (
  options: BeforeUserEventOptions,
) => Promise<BeforeUserEventResult>;

export interface StepThroughDebuggerUI {
  onBeforeUserEvent: OnBeforeUserEventCallback;
  close: () => Promise<void>;
}

// openStepThroughDebuggerUI returns a OnBeforeUserEventCallback, which the replay code
// calls before each next event, and blocks on the returned promise. We use this to pause
// the execution until the user OKs it to continue to a certain event.
export const openStepThroughDebuggerUI = async ({
  onCloseReplayedPage,
  onLogEventTarget,
  replayableEvents,
  startAtEvent,
}: ReplayDebuggerUIOptions): Promise<StepThroughDebuggerUI> => {
  const logger = initLogger();

  let targetEventIndex: number | undefined = undefined;
  if (startAtEvent != null) {
    const arrayIndex = replayableEvents.findIndex(
      (event) =>
        "originalEventIndex" in event &&
        event.originalEventIndex === startAtEvent,
    );

    if (arrayIndex === -1) {
      const eventsWithIndices = replayableEvents
        .map((e, idx) => ({
          arrayIndex: idx,
          eventNumber:
            "originalEventIndex" in e ? e.originalEventIndex : null,
        }))
        .filter((e): e is { arrayIndex: number; eventNumber: number } =>
          e.eventNumber != null,
        );

      if (eventsWithIndices.length === 0) {
        logger.warn(
          `[debugger-ui] No events with originalEventIndex found. Starting at beginning.`,
        );
        targetEventIndex = 0;
      } else {
        const closestEvent = eventsWithIndices.reduce(
          (closest, current) => {
            if (current.eventNumber >= startAtEvent) return closest;
            if (!closest || current.eventNumber > closest.eventNumber) {
              return current;
            }
            return closest;
          },
          null as { arrayIndex: number; eventNumber: number } | null,
        );

        const minEvent = Math.min(
          ...eventsWithIndices.map((e) => e.eventNumber),
        );
        const maxEvent = Math.max(
          ...eventsWithIndices.map((e) => e.eventNumber),
        );

        if (closestEvent) {
          logger.warn(
            `[debugger-ui] Event #${startAtEvent} not found. Available events: #${minEvent} to #${maxEvent}. Starting at #${closestEvent.eventNumber}.`,
          );
          targetEventIndex = closestEvent.arrayIndex;
        } else {
          logger.warn(
            `[debugger-ui] Event #${startAtEvent} not found. Available events: #${minEvent} to #${maxEvent}. Starting at beginning.`,
          );
          targetEventIndex = 0;
        }
      }
    } else {
      targetEventIndex = arrayIndex;
      logger.info(`[debugger-ui] Auto-advancing to event #${startAtEvent}...`);
    }
  }

  const executablePath = await ensureBrowser();
  const uiServer = await startUIServer();

  const browser: Browser = await launch({
    executablePath,
    args: [`--window-size=600,1000`],
    headless: false,
  });

  const debuggerPage = (await browser.pages())[0];
  await debuggerPage.setViewport(null);

  /**
   * The index the page is in the process of advancing to. Equal to the current index
   * if the page has already replayed all the so-far-requested user events.
   */
  let targetIndex = targetEventIndex ?? 0;
  let state: ReplayDebuggerState = {
    events: replayableEvents,
    index: 0,
    loading: targetEventIndex != null && targetEventIndex > 0,
  };

  let readyPromiseResolve: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    readyPromiseResolve = resolve;
  });

  await debuggerPage.exposeFunction(
    "__meticulous__replayDebuggerDispatchEvent",
    (eventType: string, data: { index?: number }) => {
      if (eventType === "ready") {
        return onReady();
      }
      if (eventType === "check-next-target") {
        if (state.index >= replayableEvents.length) {
          logger.info("End of replay!");
          return;
        }
        const nextEvent = state.events[state.index];
        return onLogEventTarget(nextEvent);
      }
      if (eventType === "play-next-event") {
        return onPlayNextEvent();
      }
      if (eventType === "set-index") {
        return onAdvanceToIndex(data.index || 0);
      }
      logger.info(
        `[debugger-ui] Warning: received unknown event "${eventType}"`,
      );
    },
  );

  const onReady = async () => {
    readyPromiseResolve();
    await setState(state);
  };

  const setState = async (newState: Partial<ReplayDebuggerState>) => {
    await readyPromise;
    state = { ...state, ...newState };
    await debuggerPage.evaluate((s) => {
      (window as unknown as Record<string, unknown>)[
        "__meticulous__replayDebuggerSetState"
      ] = s;
    }, state as unknown as Record<string, unknown>);
  };

  let advanceToEvent: ((advanceTo: BeforeUserEventResult) => void) | null =
    null;

  const onBeforeUserEvent = async ({
    userEventIndex,
  }: BeforeUserEventOptions): Promise<BeforeUserEventResult> => {
    await setState({
      loading: userEventIndex < targetIndex,
      index: Math.max(0, Math.min(state.events.length - 1, userEventIndex)),
    });

    if (state.index < targetIndex) {
      advanceToEvent = null;
      return { nextEventIndexToPauseBefore: targetIndex };
    }

    return new Promise<BeforeUserEventResult>((resolve) => {
      advanceToEvent = resolve;
    });
  };

  const onPlayNextEvent = async () => {
    targetIndex = state.index + 1;
    await setState({ loading: true });
    advanceToEvent?.({ nextEventIndexToPauseBefore: targetIndex });
  };

  const onAdvanceToIndex = async (newTargetIndex: number) => {
    if (newTargetIndex <= state.index) {
      return;
    }
    targetIndex = newTargetIndex;
    await setState({ loading: true });
    advanceToEvent?.({ nextEventIndexToPauseBefore: targetIndex });
  };

  logger.info(`[debugger-ui] Navigating to ${uiServer.url}...`);
  const res = await debuggerPage.goto(uiServer.url, {
    waitUntil: "domcontentloaded",
  });
  const status = res && res.status();
  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site. Got a ${status} instead.`,
    );
  }
  logger.info(`[debugger-ui] Navigated to ${uiServer.url}`);

  debuggerPage.on("close", () => {
    uiServer.close();
  });

  debuggerPage.on("close", () => {
    onCloseReplayedPage();
  });

  return { onBeforeUserEvent, close: () => debuggerPage.close() };
};
