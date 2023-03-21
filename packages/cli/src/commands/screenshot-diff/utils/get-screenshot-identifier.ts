import { basename } from "path";
import { ScreenshotIdentifier } from "@alwaysmeticulous/api";

export const getScreenshotIdentifier = (
  filename: string
): ScreenshotIdentifier | undefined => {
  const name = basename(filename);

  if (name === "final-state.png") {
    return {
      type: "end-state",
    };
  }

  if (name.startsWith("screenshot-after-event")) {
    const match = name.match(/^(?:.*)-(\d+)[.]png$/);
    const eventNumber = match ? parseInt(match[1], 10) : undefined;

    if (match && eventNumber != null && !isNaN(eventNumber)) {
      return {
        type: "after-event",
        eventNumber,
      };
    }
  }

  return undefined;
};
