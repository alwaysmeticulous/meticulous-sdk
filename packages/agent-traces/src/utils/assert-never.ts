/** Exhaustiveness check; this package can't depend on the private common-utils. */
export const assertNever = (value: never, message?: string): never => {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
};
