import { ScreenshotIdentifier } from "@alwaysmeticulous/api";

// Note: ideally this should match the filenames produced by the screenshotting code
// in replay-node, and in https://github.com/alwaysmeticulous/meticulous-sdk/blob/395af4394dc51d9b51ba1136fc26b23fcbba5604/packages/replayer/src/screenshot.utils.ts#L42
export const getScreenshotFilename = (identifier: ScreenshotIdentifier) => {
  if (identifier.type === "end-state") {
    return "final-state.png";
  } else if (identifier.type === "after-event") {
    const eventIndexStr = identifier.eventNumber.toString().padStart(5, "0");
    return `screenshot-after-event-${eventIndexStr}.png`;
  } else {
    throw new Error(
      "Unexpected screenshot identifier: " + JSON.stringify(identifier)
    );
  }
};
