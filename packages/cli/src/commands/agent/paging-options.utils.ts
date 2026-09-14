import type { Options as YargsOptions } from "yargs";

/**
 * The paging flags every paged `agent` command declares, so the bounds and the
 * wording are stated once. The backend caps each endpoint separately — rows
 * differ in weight, and a coverage row with ranges is orders of magnitude
 * larger than a daily-stats row — so `maxLimit` is per command; the default
 * page size is deliberately the same 100 everywhere, since that is what a
 * caller gets when it doesn't think about paging at all.
 *
 * There is no "return everything" value: an unbounded answer is the one shape
 * that can neither be read nor recovered from, and every paged getter reports
 * whether more exists, so paging is always a decision the caller can make.
 */
export const pagingOptions = (
  items: string,
  maxLimit: number,
  { defaultLimit = 100 }: { defaultLimit?: number } = {},
): Record<string, YargsOptions> => ({
  limit: {
    number: true,
    description: `Maximum number of ${items} to return (1-${maxLimit}). Defaults to ${defaultLimit}.`,
    coerce: coerceLimit(maxLimit),
  },
  offset: {
    number: true,
    description: `Skip this many matching ${items} before returning results, for pagination.`,
    coerce: coerceOffset,
  },
});

export const coerceLimit =
  (max: number) =>
  (value: number | undefined): number | undefined => {
    if (
      value != null &&
      (!Number.isInteger(value) || value < 1 || value > max)
    ) {
      throw new Error(`--limit must be an integer between 1 and ${max}.`);
    }
    return value;
  };

export const coerceOffset = (value: number | undefined): number | undefined => {
  if (value != null && (!Number.isInteger(value) || value < 0)) {
    throw new Error("--offset must be a non-negative integer.");
  }
  return value;
};
