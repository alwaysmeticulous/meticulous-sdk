import {
  createClientWithOAuth,
  getTimelineEvent,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireIdArgument } from "./argument-validation.utils";
import { formatTimelineEvent } from "./timeline-event.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayId: string;
  eventId: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayId,
  eventId,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayId", replayId);
  requireIdArgument("eventId", eventId);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const details = await getTimelineEvent(client, replayId, eventId);

  if (json) {
    printJson(details);
    return;
  }
  for (const line of formatTimelineEvent(details)) {
    console.log(line);
  }
};

export const timelineEventCommand: CommandModule<unknown, Options> = {
  command: "timeline-event",
  describe:
    "Get the full details of a timeline event for a given replay: for user events the match result, confidence, the inputs dispatched (keys, modifiers, scroll and wheel deltas, typed values), coordinates, what was at the coordinates or obscured a press (with its child-index path from <body>, as 'agent dom' takes it), how many elements deep below <body> the recorded target and the matched element sit, and the recorded target path aligned against the matched element's: one row per target element, marked - when the matcher skipped it, plus a row marked + for each extra replay element it skipped, each element given in full as the matcher compares it (tag, 0-based sibling index, classes, scored attributes, text, then the id and other attributes it doesn't score), with its score and, below the maximum, what each scoring component got; for network requests the request, the recording served and why the matcher chose it, the response, any patching applied and the time taken; for console messages and errors the message and the stack, source-mapped where the replay could; for navigations the URL and its URL pattern; for the other kinds their recorded fields. A body or value over 4000 characters is cut short, ending in its full length and a hash of the full text, and credential header values (cookies, authorization) are redacted. Outputs one key:\\tvalue line per field, keyed by its --json path: eventId, timeMs, kind, entryKind and a section named after the kind (user.*, network.*, url.*, message.*, screenshot.*, …), with user.path[i] the recorded element path in order.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayId: {
      string: true,
      description: "The replay ID.",
      demandOption: true,
    },
    eventId: {
      string: true,
      description:
        "The event ID as output by 'agent timeline' (e.g. user:42, after-event-12, idx:57); not a base:/head: ID, which 'agent timeline-event-diff' takes.",
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
