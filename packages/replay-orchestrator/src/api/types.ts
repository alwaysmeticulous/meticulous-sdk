import { ScreenshotIdentifier } from "@alwaysmeticulous/api";

/**
 * All the information required to locate & download a screenshot of a replay.
 */
export interface ScreenshotLocator {
  replayId: string;
  screenshotIdentifier: ScreenshotIdentifier;
  screenshotUrl: string;
}
