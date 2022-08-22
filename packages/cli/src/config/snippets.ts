const BASE_SNIPPETS_URL = "https://snippet.meticulous.ai/";

export const getSnippetsBaseUrl = (): string => {
  const baseURL =
    process.env["METICULOUS_SNIPPETS_BASE_URL"] || BASE_SNIPPETS_URL;

  // Append trailing slack if missing from the provided base URL.
  return baseURL.endsWith("/") ? baseURL : baseURL + "/";
};
