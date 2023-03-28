import { TestRunEnvironment } from "@alwaysmeticulous/api";

export const getEnvironment = (
  environment?: TestRunEnvironment
): TestRunEnvironment => {
  const ci = environment?.ci ?? toBool(process.env["CI"]);
  return {
    ...environment,
    ci,
  };
};

const toBool = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return !!value;
  }
  if (typeof value === "string") {
    const stringValue = value.trim().toLowerCase();
    return stringValue === "true" || !!+stringValue;
  }
  return false;
};
