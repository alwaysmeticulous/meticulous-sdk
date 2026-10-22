import type {
  AtifObservationResult,
  AtifToolCall,
} from "../../types/atif.types";
import type { JsonRecord } from "../../utils/json-guards";
import { asString } from "../../utils/json-guards";
import type { OpenCodeTokens } from "./opencode-tokens";
import {
  addOpenCodeTokens,
  parseOpenCodeTokens,
  ZERO_OPENCODE_TOKENS,
} from "./opencode-tokens";
import { toolPartToCall } from "./tool-part-to-call";

export interface SubagentLink {
  toolCallId: string;
  childSessionId: string;
}

export interface AssistantParts {
  texts: string[];
  reasoning: string[];
  toolCalls: AtifToolCall[];
  results: AtifObservationResult[];
  subagentLinks: SubagentLink[];
  patchedFiles: string[];
  otherPartTypes: Set<string>;
  /** Summed over the message's step-finish parts, one per LLM call. */
  stepTokens: OpenCodeTokens;
  llmCallCount: number;
  retryCount: number;
}

/** Parts that only mark progress, or duplicate what other parts carry. */
const IGNORED_PART_TYPES = new Set(["step-start", "snapshot"]);

export const collectAssistantParts = (parts: JsonRecord[]): AssistantParts => {
  const collected: AssistantParts = {
    texts: [],
    reasoning: [],
    toolCalls: [],
    results: [],
    subagentLinks: [],
    patchedFiles: [],
    otherPartTypes: new Set(),
    stepTokens: ZERO_OPENCODE_TOKENS,
    llmCallCount: 0,
    retryCount: 0,
  };
  for (const part of parts) {
    addPart(collected, part);
  }
  return collected;
};

const addPart = (collected: AssistantParts, part: JsonRecord) => {
  const type = asString(part["type"]) ?? "unknown";
  switch (type) {
    case "text":
      collected.texts.push(asString(part["text"]) ?? "");
      break;
    case "reasoning":
      collected.reasoning.push(asString(part["text"]) ?? "");
      break;
    case "tool": {
      const { call, result, childSessionId } = toolPartToCall(part);
      collected.toolCalls.push(call);
      if (result) {
        collected.results.push(result);
      }
      if (childSessionId) {
        collected.subagentLinks.push({
          toolCallId: call.tool_call_id,
          childSessionId,
        });
      }
      break;
    }
    case "step-finish":
      collected.llmCallCount++;
      collected.stepTokens = addOpenCodeTokens(
        collected.stepTokens,
        parseOpenCodeTokens(part["tokens"]) ?? ZERO_OPENCODE_TOKENS,
      );
      break;
    case "patch":
      for (const file of Array.isArray(part["files"]) ? part["files"] : []) {
        if (typeof file === "string") {
          collected.patchedFiles.push(file);
        }
      }
      break;
    case "retry":
      collected.retryCount++;
      break;
    default:
      if (!IGNORED_PART_TYPES.has(type)) {
        collected.otherPartTypes.add(type);
      }
  }
};
