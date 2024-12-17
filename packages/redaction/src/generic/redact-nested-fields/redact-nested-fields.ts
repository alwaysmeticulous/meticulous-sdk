import { Redactor, RedactorsFor } from "./utils/primative-field-names";

export const redactNestedFields = <T>(
  redactor: RedactorsFor<T>
): ((value: T) => T) => {
  return createRedactor(redactor);
};

export const redactNestedFieldsIncludingNumbers = <T>(
  redactor: RedactorsFor<T, false>
): ((value: T) => T) => {
  return createRedactor(redactor);
};

export const redactNestedFieldsNonTypeSafe = <T>(
  redactor: Record<string, Redactor<any>>
): ((value: T) => T) => {
  return createRedactor(redactor as any);
};

const createRedactor = <T>(redactors: RedactorsFor<T>): ((value: T) => T) => {
  const redactFn = (value: T, key?: string): T => {
    if (value == null) {
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
