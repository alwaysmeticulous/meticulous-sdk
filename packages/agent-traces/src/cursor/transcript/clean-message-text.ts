const TIMESTAMP_TAG_REGEX = /<timestamp>([\s\S]*?)<\/timestamp>/;
const USER_QUERY_REGEX = /<user_query>([\s\S]*?)<\/user_query>/g;
/** e.g. `Monday, Aug 24, 2026, 3:01 PM (UTC-5)` */
const PROMPT_TIMESTAMP_REGEX =
  /^[A-Za-z]+, ([A-Za-z]{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM) \(UTC(?:([+-])(\d{1,2})(?::(\d{2}))?)?\)$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const REDACTED_REASONING = "[REDACTED]";

/**
 * Cursor wraps a typed prompt as
 * `<timestamp>…</timestamp>\n<user_query>\n…\n</user_query>`.
 */
export const cleanUserText = (
  raw: string,
): { text: string; timestamp: string | null } => {
  const timestampTag = TIMESTAMP_TAG_REGEX.exec(raw)?.[1];
  const withoutTimestamp = raw.replace(TIMESTAMP_TAG_REGEX, "");
  const queries = [...withoutTimestamp.matchAll(USER_QUERY_REGEX)].map(
    (match) => (match[1] ?? "").trim(),
  );
  return {
    text: queries.length > 0 ? queries.join("\n\n") : withoutTimestamp.trim(),
    timestamp: timestampTag ? parsePromptTimestamp(timestampTag.trim()) : null,
  };
};

/** Cursor appends redacted reasoning to the text as `\n\n[REDACTED]`. */
export const splitRedactedReasoning = (
  text: string,
): { text: string; reasoningRedacted: boolean } => {
  if (text === REDACTED_REASONING) {
    return { text: "", reasoningRedacted: true };
  }
  const suffix = `\n\n${REDACTED_REASONING}`;
  return text.endsWith(suffix)
    ? { text: text.slice(0, -suffix.length), reasoningRedacted: true }
    : { text, reasoningRedacted: false };
};

const parsePromptTimestamp = (text: string): string | null => {
  const match = PROMPT_TIMESTAMP_REGEX.exec(text);
  if (!match) {
    return null;
  }
  const [
    ,
    month,
    day,
    year,
    hour,
    minute,
    meridiem,
    sign,
    offsetHours,
    offsetMinutes,
  ] = match;
  const monthIndex = MONTHS.indexOf(month ?? "");
  if (monthIndex < 0) {
    return null;
  }
  const hour24 = (Number(hour) % 12) + (meridiem === "PM" ? 12 : 0);
  const offset =
    (sign === "-" ? -1 : 1) *
    (Number(offsetHours ?? 0) * 60 + Number(offsetMinutes ?? 0));
  const ms =
    Date.UTC(Number(year), monthIndex, Number(day), hour24, Number(minute)) -
    offset * 60_000;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};
