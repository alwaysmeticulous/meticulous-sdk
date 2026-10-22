import { asRecord, asString } from "../utils/json-guards";
import { IMAGE_PLACEHOLDER } from "./transcript.types";

export const flattenToolResultContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return content === null || content === undefined
      ? ""
      : JSON.stringify(content);
  }
  return content.map(flattenContentItem).join("\n");
};

const flattenContentItem = (item: unknown): string => {
  const record = asRecord(item);
  switch (asString(record?.["type"])) {
    case "text":
      return asString(record?.["text"]) ?? "";
    case "image":
      return IMAGE_PLACEHOLDER;
    case "tool_reference":
      return `[tool_reference: ${asString(record?.["tool_name"]) ?? "unknown"}]`;
    default:
      return typeof item === "string" ? item : JSON.stringify(item);
  }
};
