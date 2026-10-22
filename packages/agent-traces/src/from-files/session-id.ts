import { basename, extname } from "path";
import { AGENT_TRACE_SESSION_ID_REGEX } from "../types/constants";

const MAX_SESSION_ID_LENGTH = 128;

/**
 * The first candidate that is already a valid session id, else the first
 * that can be made one by replacing the characters S3 keys can't take.
 */
export const resolveSessionId = (
  candidates: Array<string | null>,
): string | null => {
  const present = candidates.filter((c): c is string => !!c);
  return (
    present.find((c) => AGENT_TRACE_SESSION_ID_REGEX.test(c)) ??
    present.map(sanitizeSessionId).find((c): c is string => c !== null) ??
    null
  );
};

export const isValidSessionId = (value: string | null): value is string =>
  !!value && AGENT_TRACE_SESSION_ID_REGEX.test(value);

export const fileStem = (path: string): string => basename(path, extname(path));

const sanitizeSessionId = (value: string): string | null => {
  const sanitized = value
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, MAX_SESSION_ID_LENGTH);
  return /[A-Za-z0-9]/.test(sanitized) ? sanitized : null;
};
