import { describe, expect, it } from "vitest";
import { type RequestContext, requestCaptureContext } from "../context";
import {
  createReplayTaggedConsoleMethod,
  installReplayLogTagging,
} from "../replay-log-tagging";

const replayContext = (replayId: string): RequestContext => ({
  mode: "replay",
  requestId: `request-${replayId}`,
  frontendSessionId: `session-${replayId}`,
  replayId,
  sidecarUrl: "http://127.0.0.1:9671",
  clockAnchorMs: undefined,
  waitUntil: () => undefined,
});

describe("Workerd replay log tagging", () => {
  it("tags concurrent requests with their own replay ids and preserves log arguments", async () => {
    const calls: unknown[][] = [];
    const log = createReplayTaggedConsoleMethod((...args) => calls.push(args));
    let releaseFirst: (() => void) | undefined;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    await Promise.all([
      requestCaptureContext.run(replayContext("replay-1"), async () => {
        await firstCanFinish;
        log("user=%s", "alice");
      }),
      requestCaptureContext.run(replayContext("replay-2"), () => {
        log({ event: "loaded" }, 2);
        releaseFirst?.();
      }),
    ]);

    expect(calls).toEqual([
      ["[meticulous-replay-id:replay-2] ", { event: "loaded" }, 2],
      ["[meticulous-replay-id:replay-1] user=%s", "alice"],
    ]);
  });

  it("leaves logs outside replay context unchanged", () => {
    const calls: unknown[][] = [];
    const log = createReplayTaggedConsoleMethod((...args) => calls.push(args));

    log("startup", { ready: true });

    expect(calls).toEqual([["startup", { ready: true }]]);
  });

  it("tags continuation lines in multiline strings and Error stacks", () => {
    const calls: unknown[][] = [];
    const log = createReplayTaggedConsoleMethod((...args) => calls.push(args));
    const error = new Error("boom");
    error.stack = "Error: boom\n    at handleRequest (worker.ts:42:1)";

    requestCaptureContext.run(replayContext("replay-lines"), () => {
      log("first line\nsecond line");
      log("request failed: %o", error);
    });

    expect(calls).toEqual([
      [
        "[meticulous-replay-id:replay-lines] first line\n" +
          "[meticulous-replay-id:replay-lines] second line",
      ],
      [
        "[meticulous-replay-id:replay-lines] request failed: %o",
        "Error: boom\n" +
          "[meticulous-replay-id:replay-lines]     at handleRequest (worker.ts:42:1)",
      ],
    ]);
  });

  it("installs tagged methods idempotently without mutating global console state", () => {
    const calls: unknown[][] = [];
    const noop = (): void => undefined;
    const methods = {
      debug: noop,
      error: noop,
      info: noop,
      log: (...args: unknown[]) => calls.push(args),
      trace: noop,
      warn: noop,
    };
    const holder = {};

    installReplayLogTagging(methods, holder);
    installReplayLogTagging(methods, holder);
    requestCaptureContext.run(replayContext("replay-installed"), () => {
      methods.log("rendered");
    });

    expect(calls).toEqual([
      ["[meticulous-replay-id:replay-installed] rendered"],
    ]);
  });
});
