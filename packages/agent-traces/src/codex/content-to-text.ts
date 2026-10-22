import { asArray, asRecord, asString } from "../utils/json-guards";

export const IMAGE_PLACEHOLDER = "[image omitted]";
const AUDIO_PLACEHOLDER = "[audio omitted]";

/**
 * Flattens a message's `content` or a tool output (a plain string or an
 * array of content items) to text, replacing media with placeholders.
 */
export const contentToText = (content: unknown): string => {
  const text = asString(content);
  if (text !== null) {
    return text;
  }
  return (asArray(content) ?? [])
    .flatMap((item): string[] => {
      const record = asRecord(item);
      switch (record?.["type"]) {
        case "input_text":
        case "output_text":
        case "text":
        case "reasoning_text":
        case "summary_text":
          return [asString(record["text"]) ?? ""];
        case "input_image":
        case "image":
          return [IMAGE_PLACEHOLDER];
        case "input_audio":
          return [AUDIO_PLACEHOLDER];
        default:
          return [];
      }
    })
    .join("\n");
};
