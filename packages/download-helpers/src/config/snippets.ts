import { BASE_SNIPPETS_URL } from "@alwaysmeticulous/common";

export const getSnippetsBaseUrl = (): string => {
  const baseUrl =
    process.env["METICULOUS_SNIPPETS_BASE_URL"] || BASE_SNIPPETS_URL;
  try {
    return new URL(baseUrl).href;
  } catch (e) {
    if (e instanceof TypeError) {
      throw new ConfigurationError(`Invalid base snippets URL: ${baseUrl}`);
    }

    throw e;
  }
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
