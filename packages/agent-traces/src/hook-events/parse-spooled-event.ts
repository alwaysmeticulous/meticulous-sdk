import { AGENT_TRACE_SESSION_ID_REGEX } from "../types/constants";
import { asNonEmptyString, asRecord } from "../utils/json-guards";
import type { SpooledHookEvent } from "./spooled-event.types";

/** Returns null when the file isn't a complete hook.sh event. */
export const parseSpooledEvent = (text: string): SpooledHookEvent | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  const event = asNonEmptyString(record?.["event"]);
  if (!record || !event) {
    return null;
  }
  return {
    event,
    projectDir: asNonEmptyString(record["projectDir"]),
    cwd: asNonEmptyString(record["cwd"]),
    payload: asRecord(record["payload"]),
  };
};

/**
 * Reads the payload's `sessionIdField`, falling back to a regex so an event
 * whose payload was cut off at hook.sh's size cap still lands in its session.
 */
export const readSpooledEventSessionId = (
  text: string,
  sessionIdField: string,
): string | null => {
  const fallbackRegex = new RegExp(
    `"${sessionIdField}"\\s*:\\s*"([A-Za-z0-9_-]{1,128})"`,
  );
  const sessionId =
    asNonEmptyString(parseSpooledEvent(text)?.payload?.[sessionIdField]) ??
    fallbackRegex.exec(text)?.[1] ??
    null;
  return sessionId && AGENT_TRACE_SESSION_ID_REGEX.test(sessionId)
    ? sessionId
    : null;
};
