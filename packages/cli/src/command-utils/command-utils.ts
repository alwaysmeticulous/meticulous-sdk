type UndefinedToNullOrUndefined<T extends object> = {
  [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K];
};

/**
 * yargs normally passes through undefineds, but passes through nulls for
 * numbers which fail to parse. We convert everything to undefined to standardize.
 */
export const handleNulls = <T extends object>(
  handler: (args: T) => Promise<void>
): ((args: UndefinedToNullOrUndefined<T>) => Promise<void>) => {
  return (args: UndefinedToNullOrUndefined<T>) => {
    const keys = Object.keys(args) as Array<keyof T>;
    const newArgs = keys.reduce(
      (partialArgs: Partial<T>, key: keyof T): Partial<T> => ({
        ...partialArgs,
        [key]: args[key] === null ? undefined : args[key],
      }),
      {}
    ) as T;
    return handler(newArgs);
  };
};
