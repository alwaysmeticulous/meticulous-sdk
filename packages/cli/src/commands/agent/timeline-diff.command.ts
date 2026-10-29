import {
  createClientWithOAuth,
  getTimelineDiff,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireIdArgument } from "./argument-validation.utils";
import { logResponseNotes } from "./response-notes.utils";
import {
  parseKinds,
  printTable,
  TIMELINE_DIFF_COLUMNS,
  TIMELINE_FILTER_OPTIONS,
  TIMELINE_PAGING_OPTIONS,
  type TimelineFilterFlags,
  type TimelinePagingFlags,
} from "./timeline.utils";

interface Options extends TimelineFilterFlags, TimelinePagingFlags {
  apiToken?: string | null | undefined;
  replayDiffId: string;
  includeIdenticalEvents?: boolean | undefined;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayDiffId,
  includeIdenticalEvents,
  kinds,
  sinceMs,
  untilMs,
  screenshotName,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayDiffId", replayDiffId);
  const parsedKinds = parseKinds(kinds);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getTimelineDiff(client, replayDiffId, {
    includeIdenticalEvents,
    ...(parsedKinds != null ? { kinds: parsedKinds } : {}),
    sinceMs,
    untilMs,
    screenshotName,
    limit,
    offset,
  });

  if (json) {
    printJson(response.entries);
  } else {
    printTable(response.entries, TIMELINE_DIFF_COLUMNS);
  }
  // Counts, what the filters withheld and both replay ids: written once by the
  // backend and relayed verbatim, same as every other paged getter, so stdout
  // carries only the rows a script would pipe.
  logResponseNotes(response);
};

export const timelineDiffCommand: CommandModule<unknown, Options> = {
  command: "timeline-diff",
  describe:
    "Get the list of timeline event diffs for a given replay diff, by default only the events that differ between the base and head replay plus the screenshots and user events around them (default: limit to 100 rows). Outputs a TSV table with columns diff, eventId, timeMs, kind, description, count, changes, where description is empty for screenshots, whose eventId is their name, and count is how many identical events the row stands for (empty for one; repeats of an event between the same two user events or screenshots are listed once, with a count change if the replays differ); a user event's description carries its match confidence or failure reason; the difference count, the filtered and total event counts, both replay ids and pagination are reported on stderr. Pass an eventId to 'agent timeline-event-diff' for every field of one event that differs.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description: "The replay diff ID.",
      demandOption: true,
    },
    includeIdenticalEvents: {
      boolean: true,
      description:
        "Output all events, including the ones identical in both replays, instead of only differences plus their surrounding screenshots and user events.",
    },
    ...TIMELINE_FILTER_OPTIONS,
    ...TIMELINE_PAGING_OPTIONS,
  },
  handler: wrapHandler(handler),
};
