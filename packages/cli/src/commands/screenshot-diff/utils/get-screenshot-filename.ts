import { ScreenshotIdentifier } from "@alwaysmeticulous/api";

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
