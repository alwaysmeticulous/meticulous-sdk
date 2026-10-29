import {
  createClientWithOAuth,
  getReplayTimeline,
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
  TIMELINE_COLUMNS,
  TIMELINE_FILTER_OPTIONS,
  TIMELINE_PAGING_OPTIONS,
  type TimelineFilterFlags,
  type TimelinePagingFlags,
} from "./timeline.utils";

interface Options extends TimelineFilterFlags, TimelinePagingFlags {
  apiToken?: string | null | undefined;
  replayId: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  replayId,
  kinds,
  sinceMs,
  untilMs,
  screenshotName,
  limit,
  offset,
  json,
}: Options): Promise<void> => {
  initLogger();
  requireIdArgument("replayId", replayId);
  const parsedKinds = parseKinds(kinds);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const response = await getReplayTimeline(client, replayId, {
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
    printTable(response.entries, TIMELINE_COLUMNS);
  }
  logResponseNotes(response);
};

export const timelineCommand: CommandModule<unknown, Options> = {
  command: "timeline",
  describe:
    "Get the list of timeline events for a given replay (default: limit to 100 rows). Outputs a TSV table with columns eventId, timeMs, kind, description, count, where description is empty for screenshots, whose eventId is their name, and count is how many identical consecutive events the row stands for (empty for one); a user event's description carries its match confidence or failure reason; the filtered and total event counts, the replay id and pagination are reported on stderr. Pass an eventId to 'agent timeline-event' for the full details of one event.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayId: {
      string: true,
      description: "The replay ID.",
      demandOption: true,
    },
    ...TIMELINE_FILTER_OPTIONS,
    ...TIMELINE_PAGING_OPTIONS,
  },
  handler: wrapHandler(handler),
};
