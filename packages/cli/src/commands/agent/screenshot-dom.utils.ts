import {
  MAX_SCREENSHOT_DOM_LINE_LENGTH,
  MAX_SCREENSHOT_DOM_VALUE_LENGTH,
  parseNthChildPath,
} from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";

export const NTH_CHILD_PATH_DESCRIPTION =
  "a comma-separated nth-child path from <body> counting element children only (0-based): 0,2,1 is the second child of the third child of <body>'s first child. A shadow host's 0 followed by further indices steps into its shadow root, and an <iframe>'s children are those of its frame's <body>. It is the convention of the user.elementAtCoordinatesPath and user.obscuredByPath of 'agent timeline-event', and of the hunk headers of 'agent dom-diff'.";

/** The noise 'agent dom-diff' removes, and 'agent dom' with --removeNoise. */
export const DOM_NOISE_DESCRIPTION =
  "ignored sections and elements with no visual effect (such as empty <style>s) are dropped, as are attributes that change without any visual change (such as Meticulous's bounding boxes and paint visibility); generated ids and class names are replaced with placeholders; and attributes and class names are sorted.";

export const DOM_VALUE_TRUNCATION_DESCRIPTION = `An attribute value or text over ${MAX_SCREENSHOT_DOM_VALUE_LENGTH} characters is cut short, ending in its full length and a hash, and so is a line over ${MAX_SCREENSHOT_DOM_LINE_LENGTH}, ending in its full length.`;

/**
 * `0,2,1`, or bracketed as the timeline prints a path: `[0,2,1]`. `unknown`
 * because yargs hands back an array when `--path` is repeated.
 */
export const parsePath = (path: unknown): number[] | undefined => {
  if (path != null && typeof path !== "string") {
    throw new CliUserError(
      "--path can be given only once: pass one comma-separated path, e.g. 0,2,1.",
    );
  }
  const parsed = parseNthChildPath(path);
  if (parsed?.some(Number.isNaN)) {
    throw new CliUserError(
      `--path must be comma-separated non-negative integers, e.g. 0,2,1; got "${path}".`,
    );
  }
  return parsed;
};
