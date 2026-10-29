import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";
import {
  SCREENSHOT_DOM_DIFF_TEXT_CLIENT_VERSION,
  type ScreenshotDomDiffTextOptions,
  type ScreenshotDomDiffTextResponse,
  type ScreenshotDomOptions,
  type ScreenshotDomResponse,
} from "./agent-screenshot-dom.types";

// The DOM snapshot of one screenshot of a replay, or of the element at
// `options.path` within it, paged by line.
export const getScreenshotDom = async (
  client: MeticulousClient,
  replayId: string,
  screenshotName: string,
  options: ScreenshotDomOptions = {},
): Promise<ScreenshotDomResponse> => {
  const params = pagedPathParams(options);
  if (options.removeNoise) {
    params.removeNoise = "true";
  }
  const { data } = await client
    .get(
      `agent/replays/${replayId}/screenshots/${encodeURIComponent(screenshotName)}/dom`,
      { params },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

// The DOM diff of one screenshot of a replay diff, or of the element at
// `options.path` within it, as text paged by line.
export const getScreenshotDomDiffText = async (
  client: MeticulousClient,
  replayDiffId: string,
  screenshotName: string,
  options: ScreenshotDomDiffTextOptions = {},
): Promise<ScreenshotDomDiffTextResponse> => {
  const params = pagedPathParams(options);
  params.clientVersion = String(SCREENSHOT_DOM_DIFF_TEXT_CLIENT_VERSION);
  if (options.context != null) {
    params.context = String(options.context);
  }
  const { data } = await client
    .get(
      `agent/replay-diffs/${replayDiffId}/screenshots/${encodeURIComponent(screenshotName)}/dom-diff`,
      { params },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};

const pagedPathParams = (options: {
  path?: readonly number[] | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}): Record<string, string> => {
  const params: Record<string, string> = {};
  if (options.path != null && options.path.length > 0) {
    params.path = options.path.join(",");
  }
  if (options.limit != null) {
    params.limit = String(options.limit);
  }
  if (options.offset != null) {
    params.offset = String(options.offset);
  }
  return params;
};
