import {
  createClientWithOAuth,
  DEFAULT_SCREENSHOT_DOM_LIMIT,
  getScreenshotDomDiffText,
  MAX_SCREENSHOT_DOM_LIMIT,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { requireIdArgument } from "./argument-validation.utils";
import { pagingOptions } from "./paging-options.utils";
import { logResponseNotes } from "./response-notes.utils";
import {
  DOM_NOISE_DESCRIPTION,
  DOM_VALUE_TRUNCATION_DESCRIPTION,
  NTH_CHILD_PATH_DESCRIPTION,
  parsePath,
} from "./screenshot-dom.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  screenshotName: string;
  context: string | undefined;
  path?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  screenshotName,
  context,
  path,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayDiffId", replayDiffId);
  requireIdArgument("screenshotName", screenshotName);
  const parsedContext = parseContext(context);
  const nthChildPath = parsePath(path);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getScreenshotDomDiffText(
    client,
    replayDiffId,
    screenshotName,
    {
      ...(parsedContext != null ? { context: parsedContext } : {}),
      ...(nthChildPath != null ? { path: nthChildPath } : {}),
      ...(limit != null ? { limit } : {}),
      ...(offset != null ? { offset } : {}),
    },
  );

  if (json) {
    printJson({ diff: response.diff });
  } else if (response.diff !== "") {
    console.log(response.diff);
  }
  logResponseNotes(response);
};

const parseContext = (
  context: string | undefined,
): number | "full" | undefined => {
  if (context == null || context === "full") {
    return context;
  }
  const parsed = Number(context);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUserError(
      `--context must be a non-negative integer or "full"; got "${context}".`,
    );
  }
  return parsed;
};

export const domDiffCommand: CommandModule<unknown, Options> = {
  command: "dom-diff",
  describe: `Get the DOM diff for a given screenshot diff, with noise removed from both sides before comparing them: ${DOM_NOISE_DESCRIPTION} Outputs it paged by line (default: limit to ${DEFAULT_SCREENSHOT_DOM_LIMIT} lines): each hunk starts with a line naming the element the first changed line on each side is in, as a path 'agent dom' takes ("diff 0 at path [0,2,1]", or "at base path [...], head path [...]" when they differ), then its lines unified-diff style (-, + or a space for context) with the two-space indentation of 'agent dom'. Lines are compared without their indentation, so elements re-nested under a new wrapper aren't themselves changes. A change to <html> or <body> themselves (which the snapshot leaves out) appears as a leading <!-- root element <html ...> --> comment line. ${DOM_VALUE_TRUNCATION_DESCRIPTION} The number of differences and pagination are reported on stderr. Pass --path to diff only one element and its descendants.`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description:
        'The screenshot name, as listed in the screenshotName column of `agent test-run-diffs` (e.g. "after-event-5" or "end-state").',
      demandOption: true,
    },
    context: {
      string: true,
      description:
        'Context lines around each hunk: a non-negative integer (default 3, 0 for none), or "full" for the entire DOM, with each hunk\'s header right before its changed lines.',
    },
    path: {
      string: true,
      description: `The element to diff, resolved on each side, as ${NTH_CHILD_PATH_DESCRIPTION} A side it names no element on is diffed as empty. Default: <body>.`,
    },
    ...pagingOptions("lines", MAX_SCREENSHOT_DOM_LIMIT),
  },
  handler: wrapHandler(handler),
};
