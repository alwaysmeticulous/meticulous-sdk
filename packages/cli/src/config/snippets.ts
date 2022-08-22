const BASE_SNIPPETS_URL = "https://snippet.meticulous.ai/";

export const getSnippetsBaseUrl = (): string => {
  return process.env["METICULOUS_SNIPPETS_BASE_URL"] || BASE_SNIPPETS_URL;
};
