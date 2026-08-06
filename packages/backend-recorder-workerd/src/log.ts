/**
 * console.warn every time. Only for something the app is about to see anyway (a replay call
 * that cannot be served, which throws), where knowing _which_ call it was matters more than
 * keeping the log short — a deduped key would hide every miss after the first.
 */
export const warn = (message: string): void => {
  console.warn(`[meticulous] ${message}`);
};

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
