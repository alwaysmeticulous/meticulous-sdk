/** Undefined unless `value` is a string that compiles. */
export const compileRegex = (value: unknown): RegExp | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    return new RegExp(value);
  } catch {
    return undefined;
  }
};
