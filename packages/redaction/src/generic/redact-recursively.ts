/**
 * Given an object recurses through it's structure, including inside arrays, and applies
 * the provided redaction functions. For example:
 *
 * ```js
 * // Replace all (non-id) strings with asterixes
 * redactRecursively({
 *  obj: myObject,
 *  redactString: (str, path) => path.at(-1) === "id" ? str : str.replace(/./g, "*"),
 * })
 * ```
 */
export const redactRecursively = (
  rootValue: object,
  {
    redactObject,
    redactArray,
    redactString,
    redactNumber,
    redactBigInt,
    redactBoolean,
  }: {
    /**
     * If the original object is returned then redactRecursively will recurse inside it,
     * and continue applying the redaction.
     *
     * If a new object is returned (different memory reference) then redactRecursively will
     * replace the existing object with the new object and not recurse inside it.
     */
    redactObject?: (obj: object, jsonPath: string[]) => object;

    /**
     * If the original array is returned then redactRecursively will recurse inside it,
     * and continue applying the redaction.
     *
     * If a new array is returned (different memory reference) then redactRecursively will
     * replace the existing array with the new array and not recurse inside it.
     */
    redactArray?: (arr: unknown[], jsonPath: string[]) => unknown[];
    redactString?: (str: string, jsonPath: string[]) => string;
    redactNumber?: (num: number, jsonPath: string[]) => number;
    redactBoolean?: (bool: boolean, jsonPath: string[]) => boolean;
    redactBigInt?: (bigInt: bigint, jsonPath: string[]) => bigint;
  }
) => {
  const redactValueRecursively = (
    value: unknown,
    jsonPath: string[]
  ): unknown => {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        if (redactArray) {
          const redactedValue = redactArray(value, jsonPath);
          if (redactedValue !== value) {
            return redactedValue;
          }
        }

        let hasRedacted = false;
        const redactedValueEntries = value.map((value, index) => {
          const redacted = redactValueRecursively(value, [
            ...jsonPath,
            index.toString(),
          ]);
          if (redacted !== value) {
            hasRedacted = true;
          }
          return redacted;
        });
        return hasRedacted ? redactedValueEntries : value;
      } else {
        if (redactObject) {
          const redactedValue = redactObject(value as object, jsonPath);
          if (redactedValue !== value) {
            return redactedValue;
          }
        }

        let hasRedacted = false;
        const redactedValueEntries = Object.entries(value).map(
          ([key, value]) => {
            const redacted = redactValueRecursively(value, [...jsonPath, key]);
            if (redacted !== value) {
              hasRedacted = true;
            }
            return [key, redacted];
          }
        );
        return hasRedacted ? Object.fromEntries(redactedValueEntries) : value;
      }
    } else if (typeof value === "string") {
      return redactString ? redactString(value, jsonPath) : value;
    } else if (typeof value === "number") {
      return redactNumber ? redactNumber(value, jsonPath) : value;
    } else if (typeof value === "bigint") {
      return redactBigInt ? redactBigInt(value, jsonPath) : value;
    } else if (typeof value === "boolean") {
      return redactBoolean ? redactBoolean(value, jsonPath) : value;
    } else {
      return value;
    }
  };

  return redactValueRecursively(rootValue, []);
};
