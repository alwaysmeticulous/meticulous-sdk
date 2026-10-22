import { describe, expect, it } from "vitest";
import {
  parseSpooledEvent,
  readSpooledEventSessionId,
} from "../parse-spooled-event";

const wrap = (payload: string) =>
  `{"version":1,"event":"PostToolUse","receivedAtSec":1,"projectDir":"/r","cwd":null,"payload":${payload}}\n`;

describe("parseSpooledEvent", () => {
  it("parses a spooled event", () => {
    expect(
      parseSpooledEvent(wrap('{"session_id":"abc","tool_name":"exec"}')),
    ).toEqual({
      event: "PostToolUse",
      projectDir: "/r",
      cwd: null,
      payload: { session_id: "abc", tool_name: "exec" },
    });
  });

  it("keeps the event when the payload wasn't an object", () => {
    expect(parseSpooledEvent(wrap("null"))?.payload).toBeNull();
  });

  it("rejects anything that isn't a complete event", () => {
    expect(parseSpooledEvent(wrap('{"session_id":"abc","out'))).toBeNull();
    expect(parseSpooledEvent('{"payload":{}}')).toBeNull();
  });
});

describe("readSpooledEventSessionId", () => {
  it("reads the session id from the payload", () => {
    expect(
      readSpooledEventSessionId(
        wrap('{"session_id":"3f8d1c2a-1"}'),
        "session_id",
      ),
    ).toBe("3f8d1c2a-1");
  });

  it("falls back to a regex for payloads cut off at the size cap", () => {
    expect(
      readSpooledEventSessionId(
        wrap('{"session_id":"devin-1","tool_response":"xx'),
        "session_id",
      ),
    ).toBe("devin-1");
  });

  it("reads whichever field names the agent's session", () => {
    expect(
      readSpooledEventSessionId(
        wrap('{"session_id":"x","conversation_id":"c-1"}'),
        "conversation_id",
      ),
    ).toBe("c-1");
    expect(
      readSpooledEventSessionId(
        wrap('{"conversation_id":"c-2","text":"cut o'),
        "conversation_id",
      ),
    ).toBe("c-2");
  });

  it("rejects ids that aren't path-safe", () => {
    expect(
      readSpooledEventSessionId(wrap('{"session_id":"../etc"}'), "session_id"),
    ).toBeNull();
    expect(readSpooledEventSessionId(wrap("{}"), "session_id")).toBeNull();
  });
});
