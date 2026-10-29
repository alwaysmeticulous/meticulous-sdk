import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MeticulousClient } from "../../types/client.types";
import {
  getScreenshotDom,
  getScreenshotDomDiffText,
} from "../agent-screenshot-dom.api";
import { SCREENSHOT_DOM_DIFF_TEXT_CLIENT_VERSION } from "../agent-screenshot-dom.types";

describe("getScreenshotDom", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = {
      get: vi.fn().mockResolvedValue({ data: { dom: "<body></body>" } }),
    };
  });

  it("sends no params when called with no options", async () => {
    await expect(
      getScreenshotDom(asClient(), "replay-1", "after-event-5"),
    ).resolves.toEqual({ dom: "<body></body>" });

    expect(client.get).toHaveBeenCalledWith(
      "agent/replays/replay-1/screenshots/after-event-5/dom",
      { params: {} },
    );
  });

  it("sends the path comma-separated, with the paging params", async () => {
    await getScreenshotDom(asClient(), "replay-1", "end state", {
      path: [0, 2, 1],
      limit: 50,
      offset: 100,
    });

    expect(client.get).toHaveBeenCalledWith(
      "agent/replays/replay-1/screenshots/end%20state/dom",
      { params: { path: "0,2,1", limit: "50", offset: "100" } },
    );
  });

  it("asks for the noise to be removed only when told to", async () => {
    await getScreenshotDom(asClient(), "replay-1", "end-state", {
      removeNoise: true,
    });

    expect(client.get).toHaveBeenCalledWith(
      "agent/replays/replay-1/screenshots/end-state/dom",
      { params: { removeNoise: "true" } },
    );
  });

  it("omits an empty path, which is <body> either way", async () => {
    await getScreenshotDom(asClient(), "replay-1", "end-state", { path: [] });

    expect(client.get).toHaveBeenCalledWith(
      "agent/replays/replay-1/screenshots/end-state/dom",
      { params: {} },
    );
  });
});

describe("getScreenshotDomDiffText", () => {
  let client: { get: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = { get: vi.fn().mockResolvedValue({ data: { diff: "" } }) };
  });

  it("negotiates the text response, with the context, path and page", async () => {
    await getScreenshotDomDiffText(asClient(), "rd-1", "end-state", {
      context: "full",
      path: [1, 0],
      limit: 50,
      offset: 100,
    });

    expect(client.get).toHaveBeenCalledWith(
      "agent/replay-diffs/rd-1/screenshots/end-state/dom-diff",
      {
        params: {
          clientVersion: String(SCREENSHOT_DOM_DIFF_TEXT_CLIENT_VERSION),
          context: "full",
          path: "1,0",
          limit: "50",
          offset: "100",
        },
      },
    );
  });
});
