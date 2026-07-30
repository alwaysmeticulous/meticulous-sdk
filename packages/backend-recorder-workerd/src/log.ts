const warned = new Set<string>();

/** console.warn once per unique key — capture problems must never spam or break the app. */
export const warnOnce = (
  key: string,
  message: string,
  error?: unknown,
): void => {
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  if (error === undefined) {
    console.warn(`[meticulous] ${message}`);
  } else {
    console.warn(`[meticulous] ${message}`, error);
  }
};
