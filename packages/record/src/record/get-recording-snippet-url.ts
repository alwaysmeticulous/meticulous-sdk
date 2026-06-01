import { BASE_SNIPPETS_URL } from "@alwaysmeticulous/common";
import { RECORDING_SNIPPET_ASSET_PATH } from "./constants";

export const getRecordingSnippetUrl = (): string => {
  const baseUrl =
    process.env["METICULOUS_SNIPPETS_BASE_URL"] || BASE_SNIPPETS_URL;
  return new URL(RECORDING_SNIPPET_ASSET_PATH, baseUrl).href;
};
