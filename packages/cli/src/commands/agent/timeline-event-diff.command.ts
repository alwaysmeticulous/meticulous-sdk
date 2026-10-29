import {
  createClientWithOAuth,
  getTimelineEventDiff,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireIdArgument } from "./argument-validation.utils";
import { logResponseNotes } from "./response-notes.utils";
import { formatTimelineEventDiff } from "./timeline-event.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  eventId: string;
  includeIdenticalFields?: boolean | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  eventId,
  includeIdenticalFields,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayDiffId", replayDiffId);
  requireIdArgument("eventId", eventId);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getTimelineEventDiff(client, replayDiffId, eventId, {
    includeIdenticalFields,
  });

  const { notes: _notes, ...result } = response;
  if (json) {
    printJson(result);
  } else {
    for (const line of formatTimelineEventDiff(result)) {
      console.log(line);
    }
  }
  logResponseNotes(response);
};

export const timelineEventDiffCommand: CommandModule<unknown, Options> = {
  command: "timeline-event-diff",
  describe:
    "Get the differences between the base and head details of a timeline event for a given replay diff, the details 'agent timeline-event' outputs: for user events the match result, confidence, the inputs dispatched (keys, modifiers, scroll and wheel deltas, typed values), coordinates, what was at the coordinates or obscured a press (with its child-index path from <body>, as 'agent dom' takes it), how many elements deep below <body> the recorded target and the matched element sit, and the recorded target path aligned against the matched element's: one row per target element, marked - when the matcher skipped it, plus a row marked + for each extra replay element it skipped, each element given in full as the matcher compares it (tag, 0-based sibling index, classes, scored attributes, text, then the id and other attributes it doesn't score), with its score and, below the maximum, what each scoring component got; for network requests the request, the recording served and why the matcher chose it, the response, any patching applied and the time taken; for console messages and errors the message and the stack, source-mapped where the replay could; for navigations the URL and its URL pattern; for the other kinds their recorded fields. A body or value over 4000 characters is cut short, ending in its full length and a hash of the full text, and credential header values (cookies, authorization) are redacted. The details also have a segment field, naming the click, key press or screenshot shared by both replays that the event follows (e.g. after user:12, or start), which differs when the event moved. Outputs an eventId:\\tvalue line, then one line per field that differs, keyed by its path in those details and marked like a timeline-diff row: '! user.confidence:\\t0.864 -> 0.992' when the value differs, '- field:\\tvalue' or '+ field:\\tvalue' when only base or only head has the field (as every field does for an event only one replay has); with --includeIdenticalFields the identical fields too, marked with a space. The user.path rows are lined up on the recorded target both replays share and all listed when any differs; a changed row shows base -> head in each part that differs.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
      demandOption: true,
    },
    eventId: {
      string: true,
      description:
        "The event ID as output by 'agent timeline-diff' (e.g. user:42, after-event-12, head:57, base:53); not an idx: ID, which 'agent timeline-event' takes.",
      demandOption: true,
    },
    includeIdenticalFields: {
      boolean: true,
      description:
        "Output all fields, including the ones identical in both replays (marked with a space), instead of only those that differ.",
    },
  },
  handler: wrapHandler(handler),
};
