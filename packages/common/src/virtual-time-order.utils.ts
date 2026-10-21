/**
 * The order that stably sorts replay timeline entries by when they started,
 * an entry without a virtual time counting as 0ms: the entries' positions in
 * that order, or `undefined` when they are in it already.
 *
 * Entries are collected in the order they are reported, which for a network
 * request is when it completes rather than when it started; entries at the
 * same virtual time keep that order. Storing a timeline, loading it and
 * streaming part of it all order entries through this, so the orders agree.
 */
export const getVirtualTimeOrder = (
  virtualTimeStarts: readonly (number | undefined)[],
): number[] | undefined => {
  const startOf = (index: number) => virtualTimeStarts[index] ?? 0;
  const isInOrder = virtualTimeStarts.every(
    (_, index) => index === 0 || startOf(index - 1) <= startOf(index),
  );
  if (isInOrder) {
    return undefined;
  }
  return virtualTimeStarts
    .map((_, index) => index)
    .sort((a, b) => startOf(a) - startOf(b));
};
