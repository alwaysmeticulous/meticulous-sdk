/** Milliseconds between two ISO timestamps, or null if either is missing or out of order. */
export const getElapsedMs = (
  from: string | null | undefined,
  to: string | null | undefined,
): number | null => {
  if (!from || !to) {
    return null;
  }
  const elapsedMs = Date.parse(to) - Date.parse(from);
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null;
};
