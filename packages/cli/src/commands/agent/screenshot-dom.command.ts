import {
  createClientWithOAuth,
  DEFAULT_SCREENSHOT_DOM_LIMIT,
  getScreenshotDom,
  MAX_SCREENSHOT_DOM_LIMIT,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
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
  replayId: string;
  screenshotName: string;
  path?: string | undefined;
  removeNoise?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayId,
  screenshotName,
  path,
  removeNoise,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayId", replayId);
  requireIdArgument("screenshotName", screenshotName);
  const nthChildPath = parsePath(path);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getScreenshotDom(client, replayId, screenshotName, {
    ...(nthChildPath != null ? { path: nthChildPath } : {}),
    ...(removeNoise ? { removeNoise } : {}),
    ...(limit != null ? { limit } : {}),
    ...(offset != null ? { offset } : {}),
  });

  if (json) {
    printJson({ dom: response.dom });
  } else {
    console.log(response.dom);
  }
  logResponseNotes(response);
};

export const screenshotDomCommand: CommandModule<unknown, Options> = {
  command: "dom",
  describe: `Get the DOM snapshot of one screenshot of a replay. Pass --removeNoise for the DOM with the noise 'agent dom-diff' removes before comparing (generated ids, Meticulous's annotations). Outputs the selected element's outer HTML, <body> by default, one tag per line with two-space indentation, paged by line (default: limit to ${DEFAULT_SCREENSHOT_DOM_LIMIT} lines). ${DOM_VALUE_TRUNCATION_DESCRIPTION} Pagination is reported on stderr. Pass --path to get only one element and its descendants.`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayId: {
      string: true,
      description: "The replay ID.",
      demandOption: true,
    },
    screenshotName: {
      string: true,
      description:
        "The screenshot name: a screenshot's eventId in 'agent timeline', or the screenshotName column of 'agent test-run-diffs' (e.g. \"after-event-5\" or \"end-state\").",
      demandOption: true,
    },
    path: {
      string: true,
      description: `The element to output, as ${NTH_CHILD_PATH_DESCRIPTION} Default: <body>.`,
    },
    removeNoise: {
      boolean: true,
      description: `Remove the noise 'agent dom-diff' removes from both sides: ${DOM_NOISE_DESCRIPTION} --path still indexes the DOM as captured.`,
    },
    ...pagingOptions("lines", MAX_SCREENSHOT_DOM_LIMIT),
  },
  handler: wrapHandler(handler),
};
