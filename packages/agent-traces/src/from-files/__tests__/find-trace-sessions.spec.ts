import { join } from "path";
import { describe, expect, it } from "vitest";
import { findTraceSessions } from "../find-trace-sessions";
import { piSession, writeTree } from "./trace-fixtures";

describe("findTraceSessions", () => {
  it("reports files given that aren't traces, and only counts crawled ones", async () => {
    const root = writeTree({
      "crawled/config.json": '{"theme":"dark"}',
      "crawled/session.jsonl": piSession(),
      "given.jsonl": '{"level":"info"}\n',
    });
    const unrecognised: string[] = [];

    const found = await findTraceSessions(
      [join(root, "crawled"), join(root, "given.jsonl")],
      {
        converterVersion: "test",
        onUnrecognisedFile: (path) => unrecognised.push(path),
      },
    );

    expect(found.sessions.map(({ agent }) => agent)).toEqual(["pi"]);
    expect(found.skipped).toEqual([
      {
        path: join(root, "given.jsonl"),
        reason: "not a recognised trace format",
      },
    ]);
    expect(found.unrecognisedCount).toBe(1);
    expect(unrecognised).toEqual([join(root, "crawled/config.json")]);
  });
});
