import type { AtifStep } from "../../types/atif.types";
import type { JsonRecord } from "../../utils/json-guards";
import { asNonEmptyString, asRecord, asString } from "../../utils/json-guards";
import type { OpenCodeExportMessage } from "../opencode-export.types";
import { messageTimestamp } from "./message-time";

/**
 * A user step from the message's typed text. Text OpenCode generated itself
 * (`synthetic`, e.g. the "continue" prompt after an automatic compaction) is
 * only used when there is nothing else, and then marked with an origin so it
 * isn't counted as a prompt. Messages that only request a compaction have
 * no step: the summary that follows them does.
 */
export const userMessageToStep = ({
  info,
  parts,
}: OpenCodeExportMessage): AtifStep | null => {
  const typed: string[] = [];
  const synthetic: JsonRecord[] = [];
  const subtaskPrompts: string[] = [];
  const attachments: Array<{ mime: string | null; filename: string | null }> =
    [];
  const mentionedAgents: string[] = [];
  for (const part of parts) {
    const text = asString(part["text"]);
    switch (asString(part["type"])) {
      case "text":
        if (text && part["ignored"] !== true) {
          if (part["synthetic"] === true) {
            synthetic.push(part);
          } else {
            typed.push(text);
          }
        }
        break;
      case "subtask":
        subtaskPrompts.push(asString(part["prompt"]) ?? "");
        break;
      case "file":
        attachments.push({
          mime: asNonEmptyString(part["mime"]),
          filename: asNonEmptyString(part["filename"]),
        });
        break;
      case "agent":
        mentionedAgents.push(asString(part["name"]) ?? "");
        break;
    }
  }
  const message =
    typed.join("\n\n") ||
    synthetic.map((part) => asString(part["text"])).join("\n\n") ||
    subtaskPrompts.join("\n\n");
  if (!message && attachments.length === 0) {
    return null;
  }
  const originKind =
    typed.length > 0 ? null : describeOrigin(synthetic, subtaskPrompts);
  const timestamp = messageTimestamp(info, "created");
  return {
    step_id: 0,
    ...(timestamp ? { timestamp } : {}),
    source: "user",
    message,
    extra: {
      message_id: info["id"],
      ...(asNonEmptyString(info["agent"]) ? { agent: info["agent"] } : {}),
      ...(originKind ? { origin_kind: originKind } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(mentionedAgents.length > 0
        ? { mentioned_agents: mentionedAgents }
        : {}),
    },
  };
};

const describeOrigin = (
  synthetic: JsonRecord[],
  subtaskPrompts: string[],
): string | null => {
  if (
    synthetic.some(
      (part) => asRecord(part["metadata"])?.["compaction_continue"] === true,
    )
  ) {
    return "compaction-continue";
  }
  if (synthetic.length > 0) {
    return "synthetic";
  }
  return subtaskPrompts.length > 0 ? "subtask" : null;
};
