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

  if (name.startsWith("final-state-v")) {
    const match = name.match(/^final-state-v(\d+)[.]png$/);
    const logicVersionNumber = match ? parseInt(match[1], 10) : undefined;
    if (match && logicVersionNumber != null && !isNaN(logicVersionNumber)) {
      return {
        type: "end-state",
        logicVersion: logicVersionNumber,
      };
    }
  }

  if (name.startsWith("screenshot-after-event")) {
    const match =
      name.match(/^(?:.*)-(\d+)-v(\d+)?[.]png$/) ??
      name.match(/^(?:.*)-(\d+)[.]png$/);
    const eventNumber = match ? parseInt(match[1], 10) : undefined;
    const logicVersionNumber = match ? parseInt(match[2], 10) : undefined;

    if (match && eventNumber != null && !isNaN(eventNumber)) {
      return {
        type: "after-event",
        eventNumber,
        ...(logicVersionNumber != null && !isNaN(logicVersionNumber)
          ? { logicVersion: logicVersionNumber }
          : {}),
      };
    }
  }

  return undefined;
};
