/**
 * An nth-child path written as text: comma-separated indexes, optionally
 * bracketed as the timeline prints them (`[0,2,1]`). It never throws: a part
 * that isn't a non-negative integer reads as `NaN`, and anything but a string
 * (such as the array a repeated query parameter or CLI flag gives) as `[NaN]`,
 * for the caller to reject with its own message.
 */
export const parseNthChildPath = (raw: unknown): number[] | undefined => {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== "string") {
    return [NaN];
  }
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (inner === "") {
    return [];
  }
  return inner
    .split(",")
    .map((part) => part.trim())
    .map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
};
