import type { AgentTraceRawFile } from "../../types/raw-envelope.types";
import type { ParsedCursorTranscript } from "./cursor-transcript.types";
import { parseCursorJsonlTranscript } from "./parse-cursor-jsonl-transcript";
import { parseCursorTextTranscript } from "./parse-cursor-text-transcript";

export const parseCursorTranscript = (
  file: AgentTraceRawFile,
): ParsedCursorTranscript =>
  file.relativePath.endsWith(".txt")
    ? parseCursorTextTranscript(file.content)
    : parseCursorJsonlTranscript(file.content);
