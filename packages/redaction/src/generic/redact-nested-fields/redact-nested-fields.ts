import { Redactor, RedactorsFor } from "./utils/primative-field-names";

export const redactNestedFields = <T>(
  redactor: RedactorsFor<T>
): ((value: T) => T) => {
  return createRedactor(redactor, true);
};

export const redactNestedFieldsIncludingNumbers = <T>(
  redactor: RedactorsFor<T, false>
): ((value: T) => T) => {
  return createRedactor(redactor, true);
};

export const redactNestedFieldsNonTypeSafe = <T>(
  redactor: Record<string, Redactor<any>>
): ((value: T) => T) => {
  return createRedactor(redactor as any, false);
};

// TODO: Handle full set of primative types
const createRedactor = <T>(
  redactors: RedactorsFor<T>,
  redactNumbers: boolean
): ((value: T) => T) => {
  const redactFn = (value: T, key?: string): T => {
    if (value == null) {
      return value;
    }

    if (typeof value === "number" && !redactNumbers) {
      // If there's a prop name that exists both as a number and a string,
      // but number redaction is disabled, then we only want to redact the
      // string versions
      return value;
    }

    if (Array.isArray(value)) {
      let hasRedacted = false;
      const redactedValueEntries = value.map((value) => {
        // Note: we use the key of the array here, so if you have:
        //
        // { passwords: ["password1", "password2"] }
        //
        // and set a redactor for "passwords" then it will apply it to each password
        // in the array.
        const redacted = redactFn(value, key);
        if (redacted !== value) {
          hasRedacted = true;
        }
        return redacted;
      });
      return hasRedacted ? (redactedValueEntries as T) : value;
    }

    if (typeof value === "object") {
      let hasRedacted = false;
      const redactedValueEntries = Object.entries(value).map(([key, value]) => {
        const redacted = redactFn(value, key);
        if (redacted !== value) {
          hasRedacted = true;
        }
        return [key, redacted];
      });
      return hasRedacted ? Object.fromEntries(redactedValueEntries) : value;
    }

    const fieldRedactor = key ? (redactors as any)[key] : undefined;
    if (fieldRedactor) {
      return fieldRedactor(value);
    }

    return value;
  };

  return redactFn;
};
